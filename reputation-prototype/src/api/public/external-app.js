const qs = (id) => document.getElementById(id);

const sampleConfig = {
  operator: 'Operator',
  configId: 'REAL_ESTATE_CONFIG',
  version: 2,
  activationTime: '2026-03-01T00:00:00Z',
  systemParameters: {
    reputationFloor: 0,
    reputationCeiling: 100,
    sensitivityK: 2,
  },
  components: [
    {
      componentId: 'Reliability',
      description: 'Completes transactions successfully',
      initialValue: 70,
      minValue: 0,
      maxValue: 100,
    },
    {
      componentId: 'DocumentationAccuracy',
      description: 'Correct and timely document handling',
      initialValue: 70,
      minValue: 0,
      maxValue: 100,
    },
    {
      componentId: 'Efficiency',
      description: 'Speed of transaction completion',
      initialValue: 70,
      minValue: 0,
      maxValue: 100,
    },
  ],
  roleWeights: [
    {
      roleId: 'AGENT',
      componentWeights: {
        Reliability: 0.2,
        DocumentationAccuracy: 0.4,
        Efficiency: 0.4,
      },
    },
    {
      roleId: 'BUYER',
      componentWeights: {
        Reliability: 0.5,
        DocumentationAccuracy: 0.25,
        Efficiency: 0.25,
      },
    },
  ],
  interactionTypes: [
    {
      interactionTypeId: 'SELL',
      description: 'Property sale workflow',
      ratingRules: [
        {
          componentId: 'Reliability',
          conditionField: 'closedSuccessfully',
          conditionOperator: 'EQ',
          conditionValue: 1,
          assignedRating: 85,
        },
        {
          componentId: 'Reliability',
          conditionField: 'cancelled',
          conditionOperator: 'EQ',
          conditionValue: 1,
          assignedRating: 50,
        },
        {
          componentId: 'DocumentationAccuracy',
          conditionField: 'documentRejections',
          conditionOperator: 'GT',
          conditionValue: 2,
          assignedRating: 60,
        },
        {
          componentId: 'DocumentationAccuracy',
          conditionField: 'documentRejections',
          conditionOperator: 'EQ',
          conditionValue: 0,
          assignedRating: 85,
        },
      ],
    },
  ],
  partyRoles: {
    AGENT_ALICE: 'AGENT',
    BUYER_BOB: 'BUYER',
    SELLER_CAROL: 'BUYER',
  },
  defaultRoleId: 'AGENT',
};

const sampleInteraction = {
  platform: 'Operator',
  participants: ['AGENT_ALICE', 'BUYER_BOB'],
  interactionType: 'SELL',
  outcome: {
    closedSuccessfully: 1,
    cancelled: 0,
    documentRejections: 0,
  },
  completedAt: new Date().toISOString(),
  configVersion: 1,
  evaluated: false,
};

const sampleFeedback = {
  platform: 'Operator',
  interactionId: 'sell_2026_004',
  from: 'BUYER_BOB',
  to: 'AGENT_ALICE',
  componentRatings: {
    Reliability: 90,
    DocumentationAccuracy: 87,
    Efficiency: 84,
  },
  submittedAt: new Date().toISOString(),
  phase: 'FINAL',
};

function asPretty(value) {
  return JSON.stringify(value, null, 2);
}

function appendLog(message, payload = null) {
  const stamp = new Date().toISOString();
  const lines = [`[${stamp}] ${message}`];
  if (payload != null) {
    lines.push(asPretty(payload));
  }
  const existing = qs('logView').textContent.trim();
  const next = `${lines.join('\n')}\n\n${existing}`.trim();
  qs('logView').textContent = next;
}

function parseJsonFromTextarea(id) {
  const raw = qs(id).value.trim();
  if (!raw) {
    throw new Error('Payload is empty.');
  }
  return JSON.parse(raw);
}

async function requestJson(path, options = {}) {
  const response = await fetch(path, options);
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(body.error || `HTTP ${response.status}`);
  }
  return body;
}

async function deployContract(templateId, payload) {
  const autoProcess = qs('autoProcess').checked;
  const endpoint = `/mock/contracts/${encodeURIComponent(templateId)}?autoProcess=${String(autoProcess)}`;
  const result = await requestJson(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  appendLog(`Published ${templateId}`, result);
  await refreshViews();
}

async function processNow() {
  const result = await requestJson('/engine/process', { method: 'POST' });
  appendLog('Processed engine manually', result);
  await refreshViews();
}

async function refreshEvents() {
  const events = await requestJson('/events');
  qs('eventsView').textContent = asPretty(events);
}

async function refreshRankings() {
  const rankings = await requestJson('/rankings?limit=20');
  qs('rankingsView').textContent = asPretty(rankings);
}

async function refreshConfig() {
  const config = await requestJson('/config');
  qs('configView').textContent = asPretty(config);
}

async function requestVc(event) {
  event.preventDefault();
  const party = qs('vcParty').value.trim();
  if (!party) {
    appendLog('VC request failed', { error: 'Party is required.' });
    return;
  }

  const disclosed = qs('vcComponents')
    .value.split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  const vc = await requestJson('/vc/request', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      party,
      disclosedComponents: disclosed,
    }),
  });

  qs('vcView').textContent = asPretty(vc);
  appendLog(`Issued VC for ${party}`, vc);
}

async function refreshViews() {
  await Promise.all([refreshEvents(), refreshRankings(), refreshConfig()]);
}

function wireButtons() {
  qs('loadConfigSample').addEventListener('click', () => {
    qs('configPayload').value = asPretty(sampleConfig);
  });

  qs('loadInteractionSample').addEventListener('click', () => {
    qs('interactionPayload').value = asPretty(sampleInteraction);
  });

  qs('loadFeedbackSample').addEventListener('click', () => {
    qs('feedbackPayload').value = asPretty(sampleFeedback);
  });

  qs('deployConfig').addEventListener('click', async () => {
    try {
      await deployContract('ReputationConfiguration', parseJsonFromTextarea('configPayload'));
    } catch (error) {
      appendLog('Failed to deploy configuration', { error: error.message });
    }
  });

  qs('deployInteraction').addEventListener('click', async () => {
    try {
      await deployContract('CompletedInteraction', parseJsonFromTextarea('interactionPayload'));
    } catch (error) {
      appendLog('Failed to deploy interaction', { error: error.message });
    }
  });

  qs('deployFeedback').addEventListener('click', async () => {
    try {
      await deployContract('Feedback', parseJsonFromTextarea('feedbackPayload'));
    } catch (error) {
      appendLog('Failed to deploy feedback', { error: error.message });
    }
  });

  qs('processNow').addEventListener('click', async () => {
    try {
      await processNow();
    } catch (error) {
      appendLog('Manual process failed', { error: error.message });
    }
  });

  qs('refreshViews').addEventListener('click', async () => {
    try {
      await refreshViews();
      appendLog('Views refreshed');
    } catch (error) {
      appendLog('Refresh failed', { error: error.message });
    }
  });

  qs('refreshEvents').addEventListener('click', refreshEvents);
  qs('refreshRankings').addEventListener('click', refreshRankings);
  qs('refreshConfig').addEventListener('click', refreshConfig);
  qs('vcForm').addEventListener('submit', async (event) => {
    try {
      await requestVc(event);
    } catch (error) {
      appendLog('VC issuance failed', { error: error.message });
    }
  });
}

function initPayloads() {
  qs('configPayload').value = asPretty(sampleConfig);
  qs('interactionPayload').value = asPretty(sampleInteraction);
  qs('feedbackPayload').value = asPretty(sampleFeedback);
}

async function init() {
  initPayloads();
  wireButtons();
  await refreshViews();
  appendLog('External app simulator ready');
}

init().catch((error) => {
  appendLog('Initialization failed', { error: error.message });
});
