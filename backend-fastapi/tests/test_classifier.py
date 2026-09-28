"""Trained-classifier grading path (grading/classifier.py + grading/pipeline.py).

The scoring math is pure Python and always runs. The end-to-end tests build a
real (randomly initialized, so no pretrained-weight download) MobileNetV3
checkpoint through ml-training's grading_model.py and serve it — they need
requirements-ml.txt and are skipped without it.
"""
import importlib.util
import sys
from pathlib import Path

import pytest

import db as db_module
from grading.classifier import Prediction, combine_predictions, load_classifier, score_probabilities
from grading.pipeline import grade_attributes
from grading.router import resolve_evidence_path


def test_score_is_the_probability_weighted_class_score():
    prediction = score_probabilities(
        [0.7, 0.2, 0.1], ["clean", "minor", "heavy"], {"clean": 1.0, "minor": 0.5, "heavy": 0.0}
    )
    assert prediction.score == pytest.approx(0.8)
    assert prediction.confidence == pytest.approx(0.7)
    assert prediction.label == "clean"


def test_probabilities_are_renormalized():
    prediction = score_probabilities([2.0, 2.0], ["good", "bad"], {"good": 1.0, "bad": 0.0})
    assert prediction.score == pytest.approx(0.5)
    assert prediction.confidence == pytest.approx(0.5)


def test_mismatched_lengths_are_rejected():
    with pytest.raises(ValueError):
        score_probabilities([1.0], ["a", "b"], {"a": 1.0, "b": 0.0})


def test_combining_photos_averages_and_takes_the_majority_label():
    combined = combine_predictions(
        [Prediction(0.9, 0.8, "clean"), Prediction(0.7, 0.6, "clean"), Prediction(0.2, 0.9, "heavy")]
    )
    assert combined.score == pytest.approx(0.6)
    assert combined.confidence == pytest.approx(0.7667, abs=1e-4)
    assert combined.label == "clean"


def test_no_checkpoint_means_no_classifier(tmp_path, monkeypatch):
    monkeypatch.setattr(db_module.settings, "GRADING_MODELS_DIR", str(tmp_path))
    assert load_classifier("agriculture", "foreign_matter") is None
    assert load_classifier(None, "foreign_matter") is None


def test_evidence_paths_resolve_against_the_django_media_root(monkeypatch):
    monkeypatch.setattr(db_module.settings, "DJANGO_MEDIA_ROOT", "/srv/media")
    assert resolve_evidence_path("grading_evidence/listing_1/a.jpg") == "/srv/media/grading_evidence/listing_1/a.jpg"
    assert resolve_evidence_path("/abs/a.jpg") == "/abs/a.jpg"


# --- real inference (requires requirements-ml.txt) ------------------------

_GRADING_MODEL_PATH = Path(__file__).resolve().parents[2] / "ml-training" / "scripts" / "grading_model.py"


@pytest.fixture
def trained_models_dir(tmp_path, monkeypatch):
    torch = pytest.importorskip("torch")
    pytest.importorskip("torchvision")
    spec = importlib.util.spec_from_file_location("grading_model_for_tests", _GRADING_MODEL_PATH)
    grading_model = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = grading_model
    spec.loader.exec_module(grading_model)

    classes = ["0_clean", "1_minor", "2_heavy"]
    model = grading_model.build_model(num_classes=len(classes), pretrained=False)
    checkpoint = grading_model.make_checkpoint(
        model, classes, grading_model.default_class_scores(classes), val_accuracy=0.0
    )
    (tmp_path / "models" / "pytest-vertical").mkdir(parents=True)
    torch.save(checkpoint, tmp_path / "models" / "pytest-vertical" / "foreign_matter.pt")
    monkeypatch.setattr(db_module.settings, "GRADING_MODELS_DIR", str(tmp_path / "models"))
    return tmp_path


@pytest.fixture
def evidence_image(tmp_path):
    image_module = pytest.importorskip("PIL.Image")
    path = tmp_path / "grain.jpg"
    image_module.new("RGB", (320, 240), color=(200, 170, 90)).save(path)
    return str(path)


def test_checkpoint_is_served_through_the_shared_model_definition(trained_models_dir, evidence_image):
    classifier = load_classifier("pytest-vertical", "foreign_matter")

    assert classifier is not None
    assert classifier.class_scores == {"0_clean": 1.0, "1_minor": 0.5, "2_heavy": 0.0}
    prediction = classifier.predict(evidence_image)
    assert 0.0 <= prediction.score <= 1.0
    assert 1 / 3 - 1e-6 <= prediction.confidence <= 1.0
    assert prediction.label in classifier.classes


def test_grade_attributes_uses_the_model_where_one_exists(trained_models_dir, evidence_image):
    result = grade_attributes([evidence_image], ["foreign_matter"], vertical_slug="pytest-vertical")

    assert result["method"] == "mobilenetv3-small (foreign_matter)"
    assert 0.0 <= result["attribute_scores"]["foreign_matter"] <= 1.0
    assert result["needs_verification"] == (result["overall_confidence"] < 0.80)


def test_attributes_without_a_model_fall_back_per_attribute(trained_models_dir, evidence_image):
    result = grade_attributes([evidence_image], ["foreign_matter", "discoloration"], vertical_slug="pytest-vertical")

    assert result["method"].startswith("mobilenetv3-small (foreign_matter); ")
    assert "(discoloration)" in result["method"]
    assert set(result["attribute_scores"]) == {"foreign_matter", "discoloration"}
    # overall confidence is the least certain attribute's
    assert result["overall_confidence"] <= 1.0


def test_evidence_missing_locally_is_downloaded_from_blob_storage(tmp_path, monkeypatch):
    import httpx

    from grading.router import local_evidence

    monkeypatch.setattr(db_module.settings, "DJANGO_MEDIA_ROOT", str(tmp_path / "empty-media"))
    monkeypatch.setattr(db_module.settings, "EVIDENCE_BASE_URL", "https://acct.blob.core.windows.net/media")
    monkeypatch.setattr(db_module.settings, "EVIDENCE_URL_QUERY", "sv=2024&sig=abc")
    requested = []

    def fake_get(url, timeout):
        requested.append(url)
        if "missing" in url:
            return httpx.Response(404, request=httpx.Request("GET", url))
        return httpx.Response(200, content=b"jpeg-bytes", request=httpx.Request("GET", url))

    monkeypatch.setattr(httpx, "get", fake_get)
    with local_evidence(["grading_evidence/listing_1/a.jpg", "grading_evidence/listing_1/missing.jpg"]) as paths:
        assert len(paths) == 1
        assert Path(paths[0]).read_bytes() == b"jpeg-bytes"
        downloaded_dir = Path(paths[0]).parent
    assert requested[0] == "https://acct.blob.core.windows.net/media/grading_evidence/listing_1/a.jpg?sv=2024&sig=abc"
    assert not downloaded_dir.exists()  # temp files are cleaned up after grading


def _grading_model_pure():
    """grading_model.py imports torch/cv2 lazily, so its pure helpers load anywhere."""
    spec = importlib.util.spec_from_file_location("grading_model_pure", _GRADING_MODEL_PATH)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module  # @dataclass looks its module up here
    spec.loader.exec_module(module)
    return module


def test_decide_is_argmax_without_a_decision_rule():
    gm = _grading_model_pure()
    assert gm.decide([0.2, 0.5, 0.3], ["good", "hole", "oil"], {}) == ("hole", 0.5)


def test_calibrated_threshold_keeps_uncertain_items_good():
    gm = _grading_model_pure()
    analysis = {"decision": {"good_class": "good", "bad_threshold": 0.8}}
    classes = ["good", "hole", "oil"]
    # argmax says "hole", but P(not good) = 0.7 < 0.8
    assert gm.decide([0.3, 0.4, 0.3], classes, analysis) == ("good", 0.3)
    label, confidence = gm.decide([0.1, 0.3, 0.6], classes, analysis)
    assert label == "oil" and confidence == pytest.approx(0.9)


def test_share_below_the_noise_floor_costs_nothing():
    gm = _grading_model_pure()
    analysis = {"attributes": {"defect_rate": {"bad_classes": ["hole"], "tolerance": 0.1, "floor": 0.02}}}
    clean = ["good"] * 98 + ["hole"] * 2
    dirty = ["good"] * 88 + ["hole"] * 12
    assert gm.share_scores(clean, analysis)["defect_rate"]["score"] == 1.0
    assert gm.share_scores(dirty, analysis)["defect_rate"]["score"] == 0.0


@pytest.mark.parametrize(
    ("vertical", "attributes", "mode"),
    [("agriculture", {"foreign_matter", "damaged_kernels"}, "kernels"), ("textiles", {"defect_rate"}, "patches")],
)
def test_bundled_graders_load_and_route_to_verification(vertical, attributes, mode, monkeypatch):
    """The checkpoints committed under ml-training/checkpoints/ must load
    through the serving path (with the ML stack installed) and keep their
    confidence capped below the verification threshold."""
    pytest.importorskip("torch")
    pytest.importorskip("timm")
    from grading.classifier import load_grader
    from grading.pipeline import CONFIDENCE_VERIFICATION_THRESHOLD

    monkeypatch.setattr(db_module.settings, "GRADING_MODELS_DIR", "")
    grader = load_grader(vertical)
    assert grader is not None
    assert grader.attributes == attributes
    assert grader.analysis["mode"] == mode
    assert "decision" in grader.analysis  # calibrated by evaluate_grader.py --write
    assert grader.confidence_cap < CONFIDENCE_VERIFICATION_THRESHOLD
