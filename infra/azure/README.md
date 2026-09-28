# Azure deployment

`main.bicep` creates everything in one resource group, sized for a student credit:

| Resource | SKU | Notes |
|---|---|---|
| Container Apps environment + Log Analytics | Consumption; 1 GB/day log cap | |
| `msme-django` | 0.5 vCPU / 1 GiB, 0–3 replicas | Runs migrations + `seed_verticals` on start; uploads go to Blob Storage |
| `msme-fastapi` | 1 vCPU / 2 GiB, exactly 1 replica | Runs the Agmarknet scheduler, so never more than one; reads evidence via a read-only SAS |
| `msme-web` | 0.5 vCPU / 1 GiB, 0–2 replicas | Next.js standalone |
| PostgreSQL Flexible Server | Burstable B1ms, 32 GB, PG 16 | TLS required; firewall admits Azure services only |
| Storage account | Standard LRS, private `media` container | |

Django and web scale to zero, so the first request after idle takes a few seconds. Expected cost
is under about $15 a month, mostly the database (its first 12 months may be free on a student
subscription).

## One-time setup

1. **Azure**. Create a resource group, plus an app registration the GitHub workflow logs in as
   (OIDC, no stored password):

   ```bash
   az group create -n msme-rg -l centralindia
   az ad app create --display-name msme-deploy        # note appId
   az ad sp create --id <appId>
   az role assignment create --assignee <appId> --role Contributor \
       --scope /subscriptions/<subscriptionId>/resourceGroups/msme-rg
   az ad app federated-credential create --id <appId> --parameters '{
     "name": "github-deploy", "issuer": "https://token.actions.githubusercontent.com",
     "subject": "repo:SparkleYR/YieldnYarn:ref:refs/heads/main",
     "audiences": ["api://AzureADTokenExchange"]}'
   ```

   Change `subject` if you deploy from another branch. `Microsoft.App`,
   `Microsoft.DBforPostgreSQL` and `Microsoft.OperationalInsights` must be registered on the
   subscription (`az provider register -n …`).

2. **GitHub → Settings → Secrets and variables → Actions**

   | Secret | Value |
   |---|---|
   | `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` | from step 1 |
   | `DB_ADMIN_PASSWORD` | a strong password (Postgres rules: 8+ chars, 3 of upper/lower/digit/symbol) |
   | `DJANGO_SECRET_KEY` | `python -c "import secrets; print(secrets.token_urlsafe(50))"` |
   | `COMPUTE_INTERNAL_TOKEN` | another random string (Django → FastAPI) |
   | `GHCR_PULL_TOKEN` | classic PAT with `read:packages`; Azure uses it to pull the images |
   | `AGMARKNET_API_KEY` | optional; data.gov.in → My Account. Without it, the public sample key is used |
   | `SENTRY_DSN` | optional |

   Optional variables: `AZURE_RESOURCE_GROUP` (default `msme-rg`), `AZURE_LOCATION` (default
   `centralindia`).

3. **Actions → Deploy to Azure → Run workflow.** It builds and pushes the three images to GHCR and
   deploys the template. It then builds the web image against the API URLs the deployment returns
   (Next.js compiles them in), deploys again, and smoke-tests all three apps. The URLs appear in
   the run summary.

After the first deploy, create an admin user:

```bash
az containerapp exec -g msme-rg -n msme-django --command "python manage.py createsuperuser"
```

## Notes

- **Cookies across hosts.** The default `*.azurecontainerapps.io` hostnames are different sites, so
  the refresh cookie is deployed with `SameSite=None; Secure`. Browsers that block third-party
  cookies (Safari) then fall back to logging in again when the access token expires. With a custom
  domain (`app.example.com` + `api.example.com`), redeploy with `refreshCookieSameSite=Lax`; add the
  domains in the Container Apps portal (managed certificates are free).
- **SAS expiry.** The evidence SAS FastAPI uses expires after a year (`evidenceSasExpiry`). Any
  redeploy renews it.
- **Deploying by hand:** `az deployment group create -g msme-rg -f infra/azure/main.bicep -p …`.
  The parameters are documented at the top of `main.bicep`.
- **Load test the deployment:**
  `python infra/loadtest/loadtest.py --api https://<django>/api --compute https://<fastapi>/compute`.
