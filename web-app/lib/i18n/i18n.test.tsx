import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { LanguageSwitcher } from "@/components/shared/language-switcher";

import { I18nProvider, useT } from "./index";
import { messages } from "./messages";

function Probe() {
  const t = useT();
  return (
    <>
      <p data-testid="title">{t("orders.title")}</p>
      <p data-testid="vars">{t("requirements.matched", { id: 42 })}</p>
    </>
  );
}

function renderWithSwitcher() {
  return render(
    <I18nProvider>
      <LanguageSwitcher />
      <Probe />
    </I18nProvider>
  );
}

describe("i18n", () => {
  beforeEach(() => window.localStorage.clear());

  it("renders English by default and fills placeholders", () => {
    renderWithSwitcher();
    expect(screen.getByTestId("title").textContent).toBe("My orders");
    expect(screen.getByTestId("vars").textContent).toBe("Seller found — order #42 created.");
  });

  it("switches to Hindi, remembers the choice, and sets <html lang>", () => {
    renderWithSwitcher();
    act(() => screen.getByRole("button", { name: "हिन्दी" }).click());

    expect(screen.getByTestId("title").textContent).toBe("मेरे ऑर्डर");
    expect(screen.getByTestId("vars").textContent).toBe("विक्रेता मिल गया — ऑर्डर #42 बना।");
    expect(window.localStorage.getItem("msme-locale")).toBe("hi");
    expect(document.documentElement.lang).toBe("hi");
  });

  it("starts in the stored language", () => {
    window.localStorage.setItem("msme-locale", "hi");
    renderWithSwitcher();
    expect(screen.getByTestId("title").textContent).toBe("मेरे ऑर्डर");
  });

  it("every Hindi string keeps the English placeholders", () => {
    const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort().join(",");
    for (const [key, english] of Object.entries(messages.en)) {
      expect(placeholders(messages.hi[key as keyof typeof messages.en]), key).toBe(placeholders(english));
    }
  });
});
