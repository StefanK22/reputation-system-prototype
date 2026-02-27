export class MockLedger {
  constructor() {
    this.events = [];
    this.nextOffset = 1;
  }

  publish(templateId, payload) {
    const offset = this.nextOffset;
    this.nextOffset += 1;

    const event = {
      offset,
      contractId: `${templateId}#${offset}`,
      templateId,
      payload,
      createdAt: new Date().toISOString(),
    };

    this.events.push(event);
    return event;
  }

  streamFrom(offsetExclusive = 0) {
    return this.events.filter((event) => event.offset > offsetExclusive);
  }

  ledgerEnd() {
    return this.nextOffset - 1;
  }
}
