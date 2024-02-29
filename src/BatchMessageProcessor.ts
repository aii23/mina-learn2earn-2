import {
  Field,
  SmartContract,
  state,
  State,
  method,
  ZkProgram,
  Bool,
  UInt64,
  Struct,
  SelfProof,
  Provable,
} from 'o1js';

function getRandomInt(min: number, max: number) {
  return min + Math.floor(Math.random() * (max - min));
}

export class MessageDetails extends Struct({
  agentId: UInt64,
  x: UInt64,
  y: UInt64,
  checksum: UInt64,
}) {
  isValid(): Bool {
    let checksumCheck = this.checksum.equals(
      this.agentId.add(this.x).add(this.y)
    );
    let agentIdRangeCheck = this.agentId.lessThanOrEqual(UInt64.from(3000));
    let xRangeCheck = this.x.lessThanOrEqual(UInt64.from(15000));
    let yRangeCheck = this.y
      .greaterThanOrEqual(UInt64.from(5000))
      .and(this.y.lessThanOrEqual(UInt64.from(20000)));
    let lockCheck = this.y.greaterThan(this.x);

    let isZeroAgent = this.agentId.equals(UInt64.zero);

    return isZeroAgent.or(
      checksumCheck
        .and(agentIdRangeCheck)
        .and(xRangeCheck)
        .and(yRangeCheck)
        .and(lockCheck)
    );
  }

  static nextRandomValid(): MessageDetails {
    let agentId = getRandomInt(0, 3000);
    let x = getRandomInt(0, 15000);
    let y = getRandomInt(Math.max(x, 5000), 20000);
    let checksum = agentId + x + y;
    return new MessageDetails({
      agentId: UInt64.from(agentId),
      x: UInt64.from(x),
      y: UInt64.from(y),
      checksum: UInt64.from(checksum),
    });
  }

  static nextRandomInValid(): MessageDetails {
    let agentId = getRandomInt(0, 3000);
    let x = getRandomInt(0, 15000);
    let y = getRandomInt(Math.max(x, 5000), 20000);
    let checksum = agentId; // Checksum invalid
    return new MessageDetails({
      agentId: UInt64.from(agentId),
      x: UInt64.from(x),
      y: UInt64.from(y),
      checksum: UInt64.from(checksum),
    });
  }
}

export const BatchProcessor = ZkProgram({
  publicInput: UInt64,
  publicOutput: UInt64,
  name: 'batch-processor',
  methods: {
    init: {
      privateInputs: [],
      method() {
        Bool(true).assertTrue();
        return UInt64.zero;
      },
    },

    processNext: {
      privateInputs: [MessageDetails, SelfProof<UInt64, UInt64>],
      method(
        messageId: UInt64,
        details: MessageDetails,
        prevProof: SelfProof<UInt64, UInt64>
      ) {
        prevProof.verify();
        let isValidMessage = details.isValid();
        let prevMessageId = prevProof.publicOutput;
        let max = Provable.if(
          prevMessageId.greaterThanOrEqual(messageId),
          prevMessageId,
          messageId
        );

        let result = Provable.if(isValidMessage, max, prevMessageId);

        return result;
      },
    },
  },
});

export class BatchProof extends ZkProgram.Proof(BatchProcessor) {}

export class BatchMessageProcessorApp extends SmartContract {
  @state(UInt64) highestMessageId = State<UInt64>();

  init() {
    super.init();
    this.highestMessageId.set(UInt64.zero);
  }

  @method process(proof: BatchProof) {
    let curValue = this.highestMessageId.getAndRequireEquals();
    proof.verify();

    let newValue = Provable.if(
      proof.publicOutput.greaterThan(curValue),
      proof.publicOutput,
      curValue
    );
    this.highestMessageId.set(newValue);
  }
}
