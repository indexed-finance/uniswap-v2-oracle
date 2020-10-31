const chai = require("chai");
chai.use(require('chai-as-promised'))
const { expect } = chai;

const freshFixture = deployments.createFixture(async ({ deployments, ethers }) => {
  await deployments.fixture();
  const ExampleKeyIndex = await ethers.getContractFactory("ExampleKeyIndex");
  const example = await ExampleKeyIndex.deploy();
  return example;
});

const filledFixture = deployments.createFixture(async ({ deployments, ethers }) => {
  await deployments.fixture();
  const ExampleKeyIndex = await ethers.getContractFactory("ExampleKeyIndex");
  const example = await ExampleKeyIndex.deploy();
  const proms = [];
  for (let i = 0; i < 512; i++) {
    proms.push(example.writeValue(i, i).then(tx => tx.wait()));
  }
  await Promise.all(proms);
  return example;
});

const sparseFixture = deployments.createFixture(async ({ deployments, ethers }) => {
  await deployments.fixture();
  const ExampleKeyIndex = await ethers.getContractFactory("ExampleKeyIndex");
  const example = await ExampleKeyIndex.deploy();
  const proms = [];
  for (let i = 0; i < 512; i += 32) {
    proms.push(example.writeValue(i, i).then(tx => tx.wait()));
  }
  await Promise.all(proms);
  return example;
});

describe("ExampleKeyIndex", function() {
  describe('getPreviousValue()', async () => {
    it('Reverts when 0 is the starting key', async () => {
      const example = await freshFixture();
      await expect(example.getPreviousValue(0, 1)).to.be.rejectedWith(/KeyIndex::findLastSetKey:Can not query value prior to 0\./g);
    });

    it('Returns false when search passes 0', async () => {
      const example = await freshFixture();
      const [foundValue, value] = await example.getPreviousValue(256, 256);
      expect(foundValue).to.be.false;
      expect(value.toNumber()).to.eq(0);
    });

    it('Finds previous value in filled indices', async () => {
      const example = await filledFixture();

      let i = 511
      try {
        for (; i > 0; i--) {
          const [foundValue, value] = await example.getPreviousValue(i, 1);
          expect(foundValue).to.be.true;
          expect(value.toNumber()).to.eq(i - 1);
        }
      } catch (err) {
        console.log(i);
        throw err;
      }
    });

    it('Finds previous value 1 key behind', async () => {
      const example = await freshFixture();
      const receipt0 = await example.writeValue(0, 100).then(tx => tx.wait());
      console.log(`First write value cost: ${receipt0.cumulativeGasUsed}`);
      const gasUsed1 = await example.estimateGas.writeValue(1, 200);
      console.log(`Second write value cost: ${gasUsed1}`);
      const gasUsed2 = await example.estimateGas.getPreviousValue(1, 1);
      console.log(`Find previous value cost: ${gasUsed2}`);
      const [foundValue, value] = await example.getPreviousValue(1, 1);
      expect(foundValue).to.be.true;
      expect(value.toNumber()).to.eq(100);
    });

    it('Fails to find value further than max distance', async () => {
      const example = await freshFixture();
      await example.writeValue(0, 100);
      await example.writeValue(1000, 200);
      let [foundValue, value] = await example.getPreviousValue(1000, 999);
      expect(foundValue).to.be.false;
      expect(value.toNumber()).to.eq(0);
      [foundValue, value] = await example.getPreviousValue(1000, 1000);
      expect(foundValue).to.be.true;
      expect(value.toNumber()).to.eq(100);
    });
  });

  describe('getNextValue()', async () => {
    it('Finds next value in filled indices', async () => {
      const example = await filledFixture();
      
      try {
        for (let i = 0; i < 511; i++) {
          const [foundValue, value] = await example.getNextValue(i, 1);
          expect(foundValue).to.be.true;
          expect(value.toNumber()).to.eq(i + 1);
        }
      } catch (err) {
        // console.log(i);
        throw err;
      }
    });

    it('Finds value 1 key ahead', async () => {
      const example = await freshFixture();
      await example.writeValue(1, 100);
      const gasUsed = await example.estimateGas.getNextValue(0, 1);
      console.log(`Find next value cost (distance 1): ${gasUsed}`);
      const [foundValue, value] = await example.getNextValue(0, 1);
      expect(foundValue).to.be.true;
      expect(value.toNumber()).to.eq(100);
    });
  
    it('Fails to find value further than max distance', async () => {
      const example = await freshFixture();
      await example.writeValue(0, 100);
      await example.writeValue(1000, 200);
      let [foundValue, value] = await example.getNextValue(0, 999);
      expect(foundValue).to.be.false;
      expect(value.toNumber()).to.eq(0);
      [foundValue, value] = await example.getNextValue(0, 1000);
      const gasUsed = await example.estimateGas.getNextValue(0, 1000);
      console.log(`getNextValue() (distance 1000) | Cost ${gasUsed}`)
      expect(foundValue).to.be.true;
      expect(value.toNumber()).to.eq(200);
    });
  });

  describe('getSetKeysInRange()', async () => {
    it('Reverts if bad range is given', async () => {
      const example = await freshFixture();
      await expect(example.getSetKeysInRange(1, 0)).to.be.rejectedWith(/ExampleKeyIndex::getSetKeysInRange: Invalid Range/g);
    });

    it('Returns all set keys in filled range', async () => {
      const example = await filledFixture();
      const setKeys = await example.getSetKeysInRange(0, 512);
      const gas = await example.estimateGas.getSetKeysInRange(0, 512);
      console.log(`getSetKeysInRange(): filled [range 512] | Cost ${gas}`);
      expect(setKeys.length).to.eq(512);
      const numericKeys = setKeys.map(k => k.toNumber());
      const expectedKeys = new Array(512).fill(null).map((_, i) => i);
      expect(numericKeys).to.deep.eq(expectedKeys);
    });

    it('Returns all set keys in sparse range', async () => {
      const example = await sparseFixture();
      const setKeys = await example.getSetKeysInRange(0, 512);
      const gas = await example.estimateGas.getSetKeysInRange(0, 512);
      console.log(`getSetKeysInRange(): sparse [range 512] | Cost ${gas}`);
      expect(setKeys.length).to.eq(16);
      const numericKeys = setKeys.map(k => k.toNumber());
      const expectedKeys = new Array(512).fill(null).map((_, i) => i).filter(i => (i % 32) == 0);
      expect(numericKeys).to.deep.eq(expectedKeys);
    });
  });

  describe('getValuesInRange()', async () => {
    it('Reverts if bad range is given', async () => {
      const example = await freshFixture();
      await expect(example.getValuesInRange(1, 0)).to.be.rejectedWith(/ExampleKeyIndex::getValuesInRange: Invalid Range/g);
    });

    it('Returns all set keys in range', async () => {
      const example = await filledFixture();
      const gas = await example.estimateGas.getValuesInRange(0, 512);
      console.log(`getValuesInRange() range 512 | Cost ${gas}`);
      const setKeys = await example.getValuesInRange(0, 512);
      expect(setKeys.length).to.eq(512);
      const numericKeys = setKeys.map(k => k.toNumber());
      const expectedValues = new Array(512).fill(null).map((_, i) => i);
      expect(numericKeys).to.deep.eq(expectedValues);
    });
  });
});
