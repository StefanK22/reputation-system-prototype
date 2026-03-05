import { requestJson } from '../../shared/clients/httpClient.js';

export class EngineApiClient {
  constructor({ baseUrl }) {
    this.baseUrl = baseUrl;
  }

  async processNewEvents() {
    return requestJson(this.baseUrl, '/process', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
  }

  async getCheckpoint() {
    const response = await requestJson(this.baseUrl, '/checkpoint');
    return Number(response.checkpoint || 0);
  }
}
