const chai = require("chai");
chai.use(require('chai-as-promised'))
const { expect } = chai;

describe("ExampleKeyIndex", function() {
  describe('getPreviousValue()', async () => {
    let example;
    beforeEach(async () => {
      const ExampleKeyIndex = await ethers.getContractFactory("ExampleKeyIndex");
      example = await ExampleKeyIndex.deploy();
    });

    it('Reverts when 0 is the starting key', async () => {
      await expect(example.getPreviousValue(0, 1)).to.be.rejectedWith(/KeyIndex::findLastSetKey:Can not query value prior to 0\./g);
    });

    it('Returns false when search passes 0', async () => {
      const [foundValue, value] = await example.getPreviousValue(256, 256);
      expect(foundValue).to.be.false;
      expect(value.toNumber()).to.eq(0);
    });

    it('Finds previous value in filled indices', async () => {
      const proms = [];
      for (let i = 0; i < 511; i++) {
        proms.push(example.writeValue(i, i).then(tx => tx.wait()));
      }
      await Promise.all(proms);

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
    let example;

    beforeEach(async () => {
      const ExampleKeyIndex = await ethers.getContractFactory("ExampleKeyIndex");
      example = await ExampleKeyIndex.deploy();
    });

    it('Finds next value in filled indices', async () => {
      const proms = [];
      for (let i = 0; i < 511; i++) {
        proms.push(example.writeValue(i, i).then(tx => tx.wait()));
      }
      await Promise.all(proms);
      
      try {
        for (let i = 0; i < 510; i++) {
          const [foundValue, value] = await example.getNextValue(i, 1);
          expect(foundValue).to.be.true;
          expect(value.toNumber()).to.eq(i + 1);
        }
      } catch (err) {
        console.log(i);
        throw err;
      }
    });

    it('Finds value 1 key ahead', async () => {
      await example.writeValue(1, 100);
      const gasUsed = await example.estimateGas.getNextValue(0, 1);
      console.log(`Find next value cost (distance 1): ${gasUsed}`);
      const [foundValue, value] = await example.getNextValue(0, 1);
      expect(foundValue).to.be.true;
      expect(value.toNumber()).to.eq(100);
    });
  
    it('Fails to find value further than max distance', async () => {
      await example.writeValue(0, 100);
      await example.writeValue(1000, 200);
      let [foundValue, value] = await example.getNextValue(0, 999);
      expect(foundValue).to.be.false;
      expect(value.toNumber()).to.eq(0);
      [foundValue, value] = await example.getNextValue(0, 1000);
      const gasUsed = await example.estimateGas.getNextValue(0, 1000);
      console.log(`Find next value cost (distance 1000): ${gasUsed}`)
      expect(foundValue).to.be.true;
      expect(value.toNumber()).to.eq(200);
    });
  });
});
