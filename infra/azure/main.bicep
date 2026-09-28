// MSME Marketplace on Azure (implementation_plan.md §11), sized for a student
// credit: Container Apps on the consumption plan (scale to zero), Postgres
// Flexible Server B1ms, one storage account for evidence photos.
//
//   az group create -n msme-rg -l centralindia
//   az deployment group create -g msme-rg -f infra/azure/main.bicep \
//     -p dbAdminPassword=... djangoSecretKey=... computeInternalToken=...
//
// The first deployment can run before any image exists: the apps start on a
// placeholder image. .github/workflows/deploy-azure.yml then builds the real
// images (the web image needs the API URLs this template outputs, because
// Next.js compiles NEXT_PUBLIC_* in) and redeploys with their tags.

@description('Short name used as a prefix for every resource.')
@minLength(3)
@maxLength(12)
param prefix string = 'msme'

param location string = resourceGroup().location

@description('Postgres Flexible Server usually needs a region with capacity for the Burstable tier.')
param dbLocation string = location

param dbAdminUser string = 'msmeadmin'

@secure()
param dbAdminPassword string

@secure()
param djangoSecretKey string

@description('Shared secret Django sends to the compute service on grading/matching calls.')
@secure()
param computeInternalToken string

@description('data.gov.in API key for Agmarknet mandi prices. Empty = the public sample key (10 rows per call).')
@secure()
param agmarknetApiKey string = ''

@secure()
param sentryDsn string = ''

@description('Container images. Defaults are a placeholder so infra can be created before the first build.')
param djangoImage string = 'mcr.microsoft.com/k8se/quickstart:latest'
param fastapiImage string = 'mcr.microsoft.com/k8se/quickstart:latest'
param webImage string = 'mcr.microsoft.com/k8se/quickstart:latest'

@description('Registry the images come from (e.g. ghcr.io). Empty = public images, no credentials.')
param registryServer string = ''
param registryUsername string = ''
@secure()
param registryPassword string = ''

@description('Refresh-cookie SameSite. The default *.azurecontainerapps.io hosts are different sites, so the cookie must be None; with a custom domain (app.example.com + api.example.com) use Lax.')
@allowed(['None', 'Lax', 'Strict'])
param refreshCookieSameSite string = 'None'

@description('Expiry of the read-only SAS the grading service uses to fetch evidence photos. Redeploy to renew.')
param evidenceSasExpiry string = dateTimeAdd(utcNow(), 'P1Y')

var suffix = uniqueString(resourceGroup().id)
var dbName = 'msme_marketplace'
var usesRegistry = !empty(registryServer)
var placeholder = 'mcr.microsoft.com/k8se/quickstart:latest'

// ---------------------------------------------------------------- logging
resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${prefix}-logs-${suffix}'
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
    workspaceCapping: { dailyQuotaGb: 1 }
  }
}

// ---------------------------------------------------------------- database
resource db 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: '${prefix}-pg-${suffix}'
  location: dbLocation
  sku: { name: 'Standard_B1ms', tier: 'Burstable' }
  properties: {
    version: '16'
    administratorLogin: dbAdminUser
    administratorLoginPassword: dbAdminPassword
    storage: { storageSizeGB: 32, autoGrow: 'Disabled' }
    backup: { backupRetentionDays: 7, geoRedundantBackup: 'Disabled' }
    highAvailability: { mode: 'Disabled' }
    network: { publicNetworkAccess: 'Enabled' }
  }
}

resource dbDatabase 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: db
  name: dbName
  properties: { charset: 'UTF8', collation: 'en_US.utf8' }
}

// Container Apps on the consumption plan have no fixed egress IP; this rule
// admits Azure-internal traffic only (not the internet). Use a VNet-integrated
// environment + private access if that isn't enough.
resource dbAllowAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2024-08-01' = {
  parent: db
  name: 'AllowAzureServices'
  properties: { startIpAddress: '0.0.0.0', endIpAddress: '0.0.0.0' }
}

// infra/init.sql's extensions must be allow-listed on Flexible Server.
resource dbExtensions 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2024-08-01' = {
  parent: db
  name: 'azure.extensions'
  properties: { value: 'POSTGIS,PG_TRGM', source: 'user-override' }
  dependsOn: [dbDatabase]
}

// ---------------------------------------------------------------- storage
resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: take('${prefix}st${suffix}', 24)
  location: location
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

resource mediaContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'media'
  properties: { publicAccess: 'None' }
}

var evidenceSas = storage.listServiceSas('2023-05-01', {
  canonicalizedResource: '/blob/${storage.name}/media'
  signedResource: 'c'
  signedPermission: 'r'
  signedProtocol: 'https'
  signedExpiry: evidenceSasExpiry
}).serviceSasToken

// ---------------------------------------------------------------- apps
resource env 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${prefix}-env'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
  }
}

var djangoName = '${prefix}-django'
var fastapiName = '${prefix}-fastapi'
var webName = '${prefix}-web'
var djangoHost = '${djangoName}.${env.properties.defaultDomain}'
var fastapiHost = '${fastapiName}.${env.properties.defaultDomain}'
var webHost = '${webName}.${env.properties.defaultDomain}'

var registries = usesRegistry
  ? [{ server: registryServer, username: registryUsername, passwordSecretRef: 'registry-password' }]
  : []
var registrySecrets = usesRegistry ? [{ name: 'registry-password', value: registryPassword }] : []

// Optional secrets are only created when set: Container Apps rejects empty ones.
var optionalSecrets = concat(
  empty(agmarknetApiKey) ? [] : [{ name: 'agmarknet-api-key', value: agmarknetApiKey }],
  empty(sentryDsn) ? [] : [{ name: 'sentry-dsn', value: sentryDsn }]
)
var optionalEnv = concat(
  empty(agmarknetApiKey) ? [] : [{ name: 'AGMARKNET_API_KEY', secretRef: 'agmarknet-api-key' }],
  empty(sentryDsn) ? [] : [{ name: 'SENTRY_DSN', secretRef: 'sentry-dsn' }]
)

var commonSecrets = concat(registrySecrets, optionalSecrets, [
  { name: 'db-password', value: dbAdminPassword }
  { name: 'compute-internal-token', value: computeInternalToken }
])

var databaseUrl = 'postgresql://${dbAdminUser}:${uriComponent(dbAdminPassword)}@${db.properties.fullyQualifiedDomainName}:5432/${dbName}?sslmode=require'

var backendEnv = concat(optionalEnv, [
  { name: 'DB_HOST', value: db.properties.fullyQualifiedDomainName }
  { name: 'DB_NAME', value: dbName }
  { name: 'DB_USER', value: dbAdminUser }
  { name: 'DB_PASSWORD', secretRef: 'db-password' }
  { name: 'DB_SSLMODE', value: 'require' }
  { name: 'DATABASE_URL', secretRef: 'database-url' }
  { name: 'COMPUTE_INTERNAL_TOKEN', secretRef: 'compute-internal-token' }
  { name: 'DJANGO_DEBUG', value: 'False' }
  { name: 'DJANGO_ALLOWED_HOSTS', value: djangoHost }
  { name: 'CORS_ALLOWED_ORIGINS', value: 'https://${webHost}' }
  { name: 'CSRF_TRUSTED_ORIGINS', value: 'https://${djangoHost}' }
  { name: 'FRONTEND_URL', value: 'https://${webHost}' }
  { name: 'FASTAPI_BASE_URL', value: 'https://${fastapiHost}' }
  { name: 'REFRESH_COOKIE_SECURE', value: 'True' }
  { name: 'REFRESH_COOKIE_SAMESITE', value: refreshCookieSameSite }
])

resource django 'Microsoft.App/containerApps@2024-03-01' = {
  name: djangoName
  location: location
  properties: {
    managedEnvironmentId: env.id
    configuration: {
      ingress: { external: true, targetPort: djangoImage == placeholder ? 80 : 8000, transport: 'auto' }
      registries: registries
      secrets: concat(commonSecrets, [
        { name: 'database-url', value: databaseUrl }
        { name: 'django-secret-key', value: djangoSecretKey }
        { name: 'storage-key', value: storage.listKeys().keys[0].value }
      ])
    }
    template: {
      containers: [
        {
          name: 'django'
          image: djangoImage
          resources: { cpu: json('0.5'), memory: '1Gi' }
          env: concat(backendEnv, [
            { name: 'DJANGO_SECRET_KEY', secretRef: 'django-secret-key' }
            { name: 'AZURE_ACCOUNT_NAME', value: storage.name }
            { name: 'AZURE_ACCOUNT_KEY', secretRef: 'storage-key' }
            { name: 'AZURE_CONTAINER', value: mediaContainer.name }
            { name: 'GUNICORN_WORKERS', value: '2' }
          ])
        }
      ]
      scale: { minReplicas: 0, maxReplicas: 3 }
    }
  }
  dependsOn: [dbAllowAzure, dbExtensions]
}

resource fastapi 'Microsoft.App/containerApps@2024-03-01' = {
  name: fastapiName
  location: location
  properties: {
    managedEnvironmentId: env.id
    configuration: {
      ingress: { external: true, targetPort: fastapiImage == placeholder ? 80 : 8001, transport: 'auto' }
      registries: registries
      secrets: concat(commonSecrets, [
        { name: 'database-url', value: databaseUrl }
        { name: 'evidence-sas', value: evidenceSas }
      ])
    }
    template: {
      containers: [
        {
          name: 'fastapi'
          image: fastapiImage
          // torch + the two graders fit comfortably; 1 vCPU keeps a photo under ~0.5 s.
          resources: { cpu: json('1.0'), memory: '2Gi' }
          env: concat(backendEnv, [
            { name: 'EVIDENCE_BASE_URL', value: '${storage.properties.primaryEndpoints.blob}${mediaContainer.name}' }
            { name: 'EVIDENCE_URL_QUERY', secretRef: 'evidence-sas' }
          ])
        }
      ]
      // Exactly one replica: it runs the APScheduler Agmarknet ingestion job.
      scale: { minReplicas: 1, maxReplicas: 1 }
    }
  }
  dependsOn: [dbAllowAzure, dbExtensions]
}

resource web 'Microsoft.App/containerApps@2024-03-01' = {
  name: webName
  location: location
  properties: {
    managedEnvironmentId: env.id
    configuration: {
      ingress: { external: true, targetPort: webImage == placeholder ? 80 : 3000, transport: 'auto' }
      registries: registries
      secrets: registrySecrets
    }
    template: {
      containers: [
        {
          name: 'web'
          image: webImage
          resources: { cpu: json('0.5'), memory: '1Gi' }
        }
      ]
      scale: { minReplicas: 0, maxReplicas: 2 }
    }
  }
}

output webUrl string = 'https://${webHost}'
output djangoApiUrl string = 'https://${djangoHost}/api'
output fastapiUrl string = 'https://${fastapiHost}/compute'
output postgresHost string = db.properties.fullyQualifiedDomainName
output storageAccount string = storage.name
