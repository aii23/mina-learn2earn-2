import {
  BatchMessageProcessorApp,
  BatchProcessor,
  MessageDetails,
} from './BatchMessageProcessor';
import {
  Field,
  Mina,
  PrivateKey,
  PublicKey,
  AccountUpdate,
  UInt64,
} from 'o1js';

/*
 * This file specifies how to test the `Add` example smart contract. It is safe to delete this file and replace
 * with your own tests.
 *
 * See https://docs.minaprotocol.com/zkapps for more info.
 */

let proofsEnabled = true;

describe('BatchMessageProcessor', () => {
  let deployerAccount: PublicKey,
    deployerKey: PrivateKey,
    senderAccount: PublicKey,
    senderKey: PrivateKey,
    zkAppAddress: PublicKey,
    zkAppPrivateKey: PrivateKey,
    zkApp: BatchMessageProcessorApp;

  beforeAll(async () => {
    let startTime = Date.now();
    if (proofsEnabled) {
      await BatchProcessor.compile();
      await BatchMessageProcessorApp.compile();
    }
    console.log(BatchProcessor.analyzeMethods().processNext.gates.length);
    console.log(`Compilation time: ${(Date.now() - startTime) / 1000} seconds`);
  });

  beforeEach(() => {
    const Local = Mina.LocalBlockchain({ proofsEnabled });
    Mina.setActiveInstance(Local);
    ({ privateKey: deployerKey, publicKey: deployerAccount } =
      Local.testAccounts[0]);
    ({ privateKey: senderKey, publicKey: senderAccount } =
      Local.testAccounts[1]);
    zkAppPrivateKey = PrivateKey.random();
    zkAppAddress = zkAppPrivateKey.toPublicKey();
    zkApp = new BatchMessageProcessorApp(zkAppAddress);
  });

  async function localDeploy() {
    const txn = await Mina.transaction(deployerAccount, () => {
      AccountUpdate.fundNewAccount(deployerAccount);
      zkApp.deploy();
    });
    await txn.prove();
    // this tx needs .sign(), because `deploy()` adds an account update that requires signature authorization
    await txn.sign([deployerKey, zkAppPrivateKey]).send();
  }

  it('all valid', async () => {
    let startTime = Date.now();
    await localDeploy();

    let curProof = await BatchProcessor.init(UInt64.zero);
    let lastId = 10;

    for (let i = 0; i < lastId + 1; i++) {
      curProof = await BatchProcessor.processNext(
        UInt64.from(i),
        MessageDetails.nextRandomValid(),
        curProof
      );
    }

    let tx = await Mina.transaction(senderAccount, () => {
      zkApp.process(curProof);
    });

    await tx.prove();
    await tx.sign([senderKey]).send();

    expect(zkApp.highestMessageId.get().toString()).toEqual(`${lastId}`);

    console.log(`Test time: ${(Date.now() - startTime) / 1000} seconds`);
  });

  it('last invalid', async () => {
    let startTime = Date.now();
    await localDeploy();

    let curProof = await BatchProcessor.init(UInt64.zero);
    let lastId = 10;

    for (let i = 0; i < lastId + 1; i++) {
      curProof = await BatchProcessor.processNext(
        UInt64.from(i),
        MessageDetails.nextRandomValid(),
        curProof
      );
    }

    curProof = await BatchProcessor.processNext(
      UInt64.from(100),
      MessageDetails.nextRandomInValid(),
      curProof
    );

    let tx = await Mina.transaction(senderAccount, () => {
      zkApp.process(curProof);
    });

    await tx.prove();
    await tx.sign([senderKey]).send();

    expect(zkApp.highestMessageId.get().toString()).toEqual(`${lastId}`);

    console.log(`Test time: ${(Date.now() - startTime) / 1000} seconds`);
  });
});
