import type {
  IAuthenticateGeneric,
  ICredentialTestRequest,
  ICredentialType,
  Icon,
  INodeProperties,
} from 'n8n-workflow';

export class ProDexAuthApi implements ICredentialType {
  name = 'prodexAuthApi';

  displayName = 'ProDex Auth API';

  documentationUrl = 'https://github.com/your-org/n8n-nodes-prodex#authentication';

  icon: Icon = {
    light: 'file:../nodes/ProDex/codex.light.svg',
    dark: 'file:../nodes/ProDex/codex.dark.svg',
  };

  properties: INodeProperties[] = [
    {
      displayName:
        'Use the ProDex Setup node: run "Start Device Login", complete browser auth, then "Export Credential Values" and paste the returned fields below.',
      name: 'bootstrapNotice',
      type: 'notice',
      default: '',
    },
    {
      displayName: 'Access Token',
      name: 'accessToken',
      type: 'string',
      typeOptions: { password: true },
      required: true,
      default: '',
    },
    {
      displayName: 'Refresh Token',
      name: 'refreshToken',
      type: 'string',
      typeOptions: { password: true },
      required: true,
      default: '',
    },
    {
      displayName: 'ID Token',
      name: 'idToken',
      type: 'string',
      typeOptions: { password: true },
      required: true,
      default: '',
      description: 'Required for Codex agent identity. Include the idToken from the bootstrap helper output.',
    },
    {
      displayName: 'Account ID',
      name: 'accountId',
      type: 'string',
      required: true,
      default: '',
      description:
        'From Setup node export (accountId). Required for Codex API requests — without it credential test fails with "Bad request".',
    },
    {
      displayName: 'Expires At',
      name: 'expiresAt',
      type: 'string',
      required: true,
      default: '',
      description: 'ISO timestamp returned by the bootstrap helper',
    },
  ];

  authenticate: IAuthenticateGeneric = {
    type: 'generic',
    properties: {
      headers: {
        Authorization: '=Bearer {{$credentials.accessToken}}',
        'ChatGPT-Account-Id': '={{$credentials.accountId}}',
        'User-Agent': 'n8n-nodes-prodex',
      },
    },
  };

  test: ICredentialTestRequest = {
    request: {
      baseURL: 'https://chatgpt.com/backend-api/codex',
      url: '/models',
      method: 'GET',
      headers: {
        'ChatGPT-Account-Id': '={{$credentials.accountId}}',
        'User-Agent': 'n8n-nodes-prodex',
        Accept: 'application/json',
      },
    },
    rules: [
      {
        type: 'responseCode',
        properties: {
          value: 200,
          message:
            'Could not validate ProDex credentials. Ensure accessToken, idToken, and accountId are copied exactly from the Setup node export.',
        },
      },
    ],
  };
}
