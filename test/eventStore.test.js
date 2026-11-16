const assert = require('assert');
const eventStore = require('../src/data/eventStore');

describe('EventStore singleton', () => {
  it('returns the shared event store instance', () => {
    assert.strictEqual(eventStore.getInstance(), eventStore);
  });

  it('prevents construction outside getInstance()', () => {
    assert.throws(
      () => new eventStore.constructor(),
      /Use EventStore\.getInstance\(\)/
    );
  });
});
