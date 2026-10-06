// Azure groundwork for a pilot environment: Container Apps + PostgreSQL Flexible Server + Blob
// Storage + Key Vault + Log Analytics. Not yet deployed or hardened (no private networking,
// no zone redundancy, no customer-managed keys). Deploy with:
//   az deployment group create -g <rg> -f infra/main.bicep -p infra/main.parameters.json -p postgresAdminPassword=<secret> ...

targetScope = 'resourceGroup'

@description('Short environment name, e.g. dev, staging, prod.')
@allowed(['dev', 'staging', 'prod'])
param environmentName string = 'dev'

param location string = resourceGroup().location

@description('Container image, e.g. myregistry.azurecr.io/kyc-review:sha-abc123.')
param containerImage string

@secure()
param postgresAdminPassword string

@secure()
param sessionSecret string

@secure()
param screeningWebhookSecret string

@description('Microsoft Entra ID tenant and app registration used for sign-in.')
param entraTenantId string = tenant().tenantId
param entraClientId string = ''
@secure()
param entraClientSecret string = ''

@secure()
@description('Optional Teams Workflows webhook URL for notifications.')
param teamsWebhookUrl string = ''

var prefix = 'kyc-${environmentName}'
var uniq = uniqueString(resourceGroup().id, environmentName)
var tags = { app: 'kyc-review', environment: environmentName }

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${prefix}-logs'
  location: location
  tags: tags
  properties: { sku: { name: 'PerGB2018' }, retentionInDays: 90 }
}

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: 'kyc${environmentName}${take(uniq, 8)}'
  location: location
  tags: tags
  properties: {
    tenantId: tenant().tenantId
    sku: { family: 'A', name: 'standard' }
    enableRbacAuthorization: true
    enableSoftDelete: true
    enablePurgeProtection: true
  }
}

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: 'kyc${environmentName}${take(uniq, 10)}'
  location: location
  tags: tags
  sku: { name: environmentName == 'prod' ? 'Standard_ZRS' : 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    supportsHttpsTrafficOnly: true
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
  properties: {
    deleteRetentionPolicy: { enabled: true, days: 30 }
    isVersioningEnabled: true
  }
}

resource documentsContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'kyc-documents'
  properties: { publicAccess: 'None' }
}

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: '${prefix}-pg-${take(uniq, 6)}'
  location: location
  tags: tags
  sku: { name: environmentName == 'prod' ? 'Standard_D2ds_v5' : 'Standard_B1ms', tier: environmentName == 'prod' ? 'GeneralPurpose' : 'Burstable' }
  properties: {
    version: '16'
    administratorLogin: 'kycadmin'
    administratorLoginPassword: postgresAdminPassword
    storage: { storageSizeGB: 32 }
    backup: { backupRetentionDays: environmentName == 'prod' ? 35 : 7, geoRedundantBackup: 'Disabled' }
    highAvailability: { mode: 'Disabled' }
  }
}

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: postgres
  name: 'kyc'
}

// TODO(pilot): replace with private networking / VNet integration instead of allowing Azure services.
resource allowAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2024-08-01' = {
  parent: postgres
  name: 'AllowAzureServices'
  properties: { startIpAddress: '0.0.0.0', endIpAddress: '0.0.0.0' }
}

resource env 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${prefix}-env'
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: { customerId: logs.properties.customerId, sharedKey: logs.listKeys().primarySharedKey }
    }
  }
}

var databaseUrl = 'postgresql://kycadmin:${uriComponent(postgresAdminPassword)}@${postgres.properties.fullyQualifiedDomainName}:5432/kyc?sslmode=require'
var storageConnection = 'DefaultEndpointsProtocol=https;AccountName=${storage.name};AccountKey=${storage.listKeys().keys[0].value};EndpointSuffix=${environment().suffixes.storage}'

var secrets = [
  { name: 'database-url', value: databaseUrl }
  { name: 'session-secret', value: sessionSecret }
  { name: 'webhook-secret', value: screeningWebhookSecret }
  { name: 'storage-connection', value: storageConnection }
  { name: 'entra-client-secret', value: empty(entraClientSecret) ? 'unset' : entraClientSecret }
  { name: 'teams-webhook-url', value: empty(teamsWebhookUrl) ? '' : teamsWebhookUrl }
]

var appEnv = [
  { name: 'DATABASE_URL', secretRef: 'database-url' }
  { name: 'SESSION_SECRET', secretRef: 'session-secret' }
  { name: 'SCREENING_WEBHOOK_SECRET', secretRef: 'webhook-secret' }
  { name: 'STORAGE_DRIVER', value: 'azure' }
  { name: 'AZURE_STORAGE_CONNECTION_STRING', secretRef: 'storage-connection' }
  { name: 'AZURE_STORAGE_CONTAINER', value: documentsContainer.name }
  { name: 'AUTH_ENTRA_TENANT_ID', value: entraTenantId }
  { name: 'AUTH_ENTRA_CLIENT_ID', value: entraClientId }
  { name: 'AUTH_ENTRA_CLIENT_SECRET', secretRef: 'entra-client-secret' }
  { name: 'AUTH_MOCK_ENABLED', value: environmentName == 'prod' ? 'false' : 'true' }
  { name: 'TEAMS_WEBHOOK_URL', secretRef: 'teams-webhook-url' }
]

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${prefix}-app'
  location: location
  tags: tags
  identity: { type: 'SystemAssigned' }
  properties: {
    managedEnvironmentId: env.id
    configuration: {
      ingress: { external: true, targetPort: 3000, transport: 'auto', allowInsecure: false }
      secrets: secrets
    }
    template: {
      containers: [
        {
          name: 'web'
          image: containerImage
          resources: { cpu: json('0.5'), memory: '1Gi' }
          env: concat(appEnv, [{ name: 'APP_BASE_URL', value: 'https://${prefix}-app.${env.properties.defaultDomain}' }])
          probes: [
            { type: 'Liveness', httpGet: { path: '/api/health', port: 3000 }, periodSeconds: 30 }
            { type: 'Readiness', httpGet: { path: '/api/health', port: 3000 }, periodSeconds: 10 }
          ]
        }
      ]
      scale: { minReplicas: 1, maxReplicas: environmentName == 'prod' ? 3 : 1 }
    }
  }
}

// Runs pending database migrations; trigger before rolling out a new revision.
resource migrateJob 'Microsoft.App/jobs@2024-03-01' = {
  name: '${prefix}-migrate'
  location: location
  tags: tags
  properties: {
    environmentId: env.id
    configuration: { triggerType: 'Manual', replicaTimeout: 600, secrets: secrets }
    template: {
      containers: [
        { name: 'migrate', image: containerImage, command: ['node', '/opt/prisma-cli/node_modules/prisma/build/index.js', 'migrate', 'deploy'], env: appEnv, resources: { cpu: json('0.25'), memory: '0.5Gi' } }
      ]
    }
  }
}

// Retries undelivered Teams notifications every 5 minutes.
resource outboxJob 'Microsoft.App/jobs@2024-03-01' = {
  name: '${prefix}-outbox'
  location: location
  tags: tags
  properties: {
    environmentId: env.id
    configuration: { triggerType: 'Schedule', scheduleTriggerConfig: { cronExpression: '*/5 * * * *' }, replicaTimeout: 120, secrets: secrets }
    template: {
      containers: [
        { name: 'outbox', image: containerImage, command: ['node', 'scripts/dispatch-outbox.js'], env: appEnv, resources: { cpu: json('0.25'), memory: '0.5Gi' } }
      ]
    }
  }
}

output appUrl string = 'https://${app.properties.configuration.ingress.fqdn}'
output keyVaultName string = vault.name
output entraRedirectUri string = 'https://${app.properties.configuration.ingress.fqdn}/auth/entra/callback'
