import type {
  IAuthenticateGeneric,
  ICredentialTestRequest,
  ICredentialType,
  Icon,
  INodeProperties,
} from 'n8n-workflow';

export class ProDexN8nApi implements ICredentialType {
  name = 'prodexN8nApi';

  displayName = 'ProDex N8N API';

  documentationUrl = 'https://docs.n8n.io/api/authentication/';

  icon: Icon = {
    light: 'file:../nodes/ProDex/prodex.svg',
    dark: 'file:../nodes/ProDex/prodex.dark.svg',
  };

  properties: INodeProperties[] = [
    {
      displayName:
        'Create an API key in n8n Settings → n8n API, then save it here once. ProDex uses this connection for n8n-as-code workflows and native Data Tables commands. The key is never written to n8nac-config.json.',
      name: 'connectionNotice',
      type: 'notice',
      default: '',
    },
    {
      displayName: 'n8n Base URL',
      name: 'baseUrl',
      type: 'string',
      default: 'http://127.0.0.1:5678',
      required: true,
      placeholder: 'https://n8n.example.com',
      description:
        'URL reachable from the n8n worker/container. In queue mode this is usually the main n8n service URL, not localhost.',
    },
    {
      displayName: 'API Key',
      name: 'apiKey',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      required: true,
    },
  ];

  authenticate: IAuthenticateGeneric = {
    type: 'generic',
    properties: {
      headers: {
        'X-N8N-API-KEY': '={{$credentials.apiKey}}',
      },
    },
  };

  test: ICredentialTestRequest = {
    request: {
      baseURL: '={{$credentials.baseUrl}}',
      url: '/api/v1/workflows?limit=1',
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    },
  };
}
