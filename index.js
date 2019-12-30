const { BN, Long, bytes, units } = require("@zilliqa-js/util");
const { Zilliqa } = require("@zilliqa-js/zilliqa");
const {
  toBech32Address,
  getAddressFromPrivateKey
} = require("@zilliqa-js/crypto");

const zilliqa = new Zilliqa("https://dev-api.zilliqa.com");

// These are set by the core protocol, and may vary per-chain.
// You can manually pack the bytes according to chain id and msg version.
// For more information: https://apidocs.zilliqa.com/?shell#getnetworkid

const chainId = 333; // chainId of the developer testnet
const msgVersion = 1; // current msgVersion
const VERSION = bytes.pack(chainId, msgVersion);

// Populate the wallet with an account
const privateKeyold =
  "3375F915F3F9AE35E6B301B7670F53AD1A5BE15D8221EC7FD5E503F21D3450C8";

const privateKey =
  "93063de7698d672e17bccec02019f918aa6e2d4ced4093ed256322a2851d93b3";
zilliqa.wallet.addByPrivateKey(privateKey);

const address = getAddressFromPrivateKey(privateKey);
console.log(`My account address is: ${address}`);
console.log(`My account bech32 address is: ${toBech32Address(address)}`);

async function testBlockchain() {
  try {
    // Get Balance
    const balance = await zilliqa.blockchain.getBalance(address);
    // Get Minimum Gas Price from blockchain
    const minGasPrice = await zilliqa.blockchain.getMinimumGasPrice();

    // Account balance (See note 1)
    console.log(`Your account balance is:`);
    console.log(balance.result);
    console.log(`Current Minimum Gas Price: ${minGasPrice.result}`);
    const NetworkId = await zilliqa.network.GetNetworkId();
    console.log(NetworkId);
    const myGasPrice = units.toQa("1000", units.Units.Li); // Gas Price that will be used by all transactions
    console.log(`My Gas Price ${myGasPrice.toString()}`);
    const isGasSufficient = myGasPrice.gte(new BN(minGasPrice.result)); // Checks if your gas price is less than the minimum gas price
    console.log(`Is the gas price sufficient? ${isGasSufficient}`);

    // Send a transaction to the network
    console.log("Sending a payment transaction to the network...");
    /*const tx = await zilliqa.blockchain.createTransaction(
      // Notice here we have a default function parameter named toDs which means the priority of the transaction.
      // If the value of toDs is false, then the transaction will be sent to a normal shard, otherwise, the transaction.
      // will be sent to ds shard. More info on design of sharding for smart contract can be found in.
      // https://blog.zilliqa.com/provisioning-sharding-for-smart-contracts-a-design-for-zilliqa-cd8d012ee735.
      // For payment transaction, it should always be false.
      zilliqa.transactions.new(
        {
          version: VERSION,
          toAddr: "0xA54E49719267E8312510D7b78598ceF16ff127CE",
          amount: new BN(units.toQa("1", units.Units.Zil)), // Sending an amount in Zil (1) and converting the amount to Qa
          gasPrice: myGasPrice, // Minimum gasPrice veries. Check the `GetMinimumGasPrice` on the blockchain
          gasLimit: Long.fromNumber(1)
        },
        false
      )
    );*/

    let tx = zilliqa.transactions.new({
      version: VERSION,
      toAddr: "0xA54E49719267E8312510D7b78598ceF16ff127CE",
      amount: units.toQa("1", units.Units.Zil),
      gasPrice: units.toQa("1000", units.Units.Li),
      gasLimit: Long.fromNumber(1)
    });

    // Send a transaction to the network
    tx = await zilliqa.blockchain.createTransaction(tx);
    console.log(tx.id);
    console.log(tx);
    console.log(`The transaction status is:`);
    console.log(tx.receipt);

    // Deploy a contract
    console.log(`Deploying a new contract....`);
    const codeDEX = `scilla_version 0

    (***************************************************)
    (*               Associated library                *)
    (***************************************************)
    import BoolUtils
    library NFT
    
    let one_msg = 
      fun (msg : Message) => 
      let nil_msg = Nil {Message} in
    Cons {Message} msg nil_msg
    
    (* Checks and see if an address is a contract owner *)
    let checkContractOwner =
        fun (msgSender: ByStr20) => 
        fun (contractOwner: ByStr20) =>
            builtin eq msgSender contractOwner
            
    
    
    (* Checks if an message sender is approved by a given owner. (i.e. operator) *)
    let isApprovedForAll = 
        fun (msgSender: ByStr20) =>
        fun (tokenOwner: ByStr20) =>
        fun (operatorMap: Map (ByStr20) (Map (ByStr20) (Bool))) =>
            let m = builtin get operatorMap tokenOwner in
            match m with
            | None => False
                (* owner did not assign anyone to the approval mapping *)
            | Some val =>
                (* val is of type Map (ByStr20) (Bool) *)
                let check_list = builtin get val msgSender in
                match check_list with
                | None => False
                | Some is_sender_approved =>
                    (* check if sender has access rights *)
                    match is_sender_approved with
                    | True => True
                    | False => False
                    end
                end
            end
    
    (* Check if a sender is an operator of the owner, approved for the given ID *)
    (* or is the owner of the token *)
    let isApprovedOrOwner =
        fun (isOwner: Bool) =>
        fun (isApproved: Bool) =>
        fun (isApprovedForAll: Bool) =>
            let isOwnerOrApproved =  orb isOwner isApproved in
            orb isOwnerOrApproved isApprovedForAll
    
    (* Error events *)
    let makeErrorEvent =
        fun (location: String) =>
        fun (errorCode: Uint32) =>
            {_eventname: "Error"; raisedAt: location; code: errorCode }
    
    (* Error codes *)
    let code_success = Uint32 0
    let code_failure = Uint32 1
    let code_not_authorized = Uint32 2
    let code_not_found = Uint32 4
    let code_bad_request = Uint32 5
    let code_token_exists = Uint32 6
    let code_unexpected_error = Uint32 9
    
    
    (***************************************************)
    (*             The contract definition             *)
    (***************************************************)
    
    contract NFT
    (contractOwner : ByStr20,
     name : String,
     symbol: String
    )
    
    (* mutable fields *)
    
    (* Mapping between tokenId to token owner *)
    field tokenOwnerMap: Map Uint256 ByStr20 = Emp Uint256 ByStr20
    (* Mapping from owner to number of owned tokens *)
    field ownedTokenCount: Map ByStr20 Uint256 = Emp ByStr20 Uint256
    
    (* Mapping between tokenId to approved address *)
    (* @dev: There can only be one approved address per token at a given time. *)
    field tokenApprovals: Map Uint256 ByStr20 = Emp Uint256 ByStr20
    
    (* Mapping from owner to operator approvals  *)
    field operatorApprovals: Map ByStr20 (Map ByStr20 Bool) 
                                = Emp ByStr20 (Map ByStr20 Bool)
    
    (* immutable field *)
    
    (* @notice Count all NFTs assigned to an owner *)
    transition balanceOf(address: ByStr20) 
        optionBal <- ownedTokenCount[address];
        balance = match optionBal with
        | Some bal => bal
        | None => Uint256 0
        end;
        e = {_eventname: "balanceOf"; bal: balance};
        event e
    end
    
    transition checkApproval (contractAddress: ByStr20, msgSender: ByStr20, tokenID: Uint256)
     
      self_DEX = _this_address;
      zero = Uint128 0;
        isApprovedCall = {_tag: "HandleBalance";
        _recipient: _sender;
        _amount: zero;
        owner: _sender;
        to: self_DEX;
        tokenID: tokenID
        };
        msgs = one_msg isApprovedCall;
        send msgs
    
    end
          
    (* Get the owner of a particular tokenId *)
    transition ownerOf(tokenId: Uint256) 
        someVal <- tokenOwnerMap[tokenId];
        match someVal with
        | Some val =>
            e = {_eventname: "ownerOf"; id: tokenId; owner: val};
            event e
        | None =>
            e = let raisedAt = "ownerOf" in makeErrorEvent raisedAt code_not_found;
            event e
        end
    end
    `;
    const codeCaller = `scilla_version 0
    
    library CallerContract
    
    let zero = Uint128 0
    let one  = Uint128 1
    
    let one_msg = 
      fun (msg : Message) => 
      let nil_msg = Nil {Message} in
      Cons {Message} msg nil_msg
     
    
    (***************************************************)
    (*             The contract definition             *)
    (***************************************************)
    
    contract CallerContract
    (calleeContract: ByStr20)
    
    field callee_balance : Uint128 = zero
    (*transition checkApproved (contractAddress: ByStr20, msgSender: ByStr20, tokenID: Uint256)*)
    transition fetchBalance (to: ByStr20, from: ByStr20, tokenid: Uint256)
        msg  = {_tag : "checkApproval";
        _recipient : calleeContract;
        _amount : Uint128 0;
        contractAddress: to;
        msgSender: from;
        tokenID : tokenid
        };
        msgs = one_msg msg;
        send msgs
    end
    
    transition HandleBalance(tokenId : Uint128, owner: ByStr20, to: ByStr20)
        (* do something with this*)
         e = {_eventname: "Successfully approved"; id: tokenId; owner: owner};
        event e
    end`;
    const initDEX = [
      // this parameter is mandatory for all init arrays
      {
        vname: "_scilla_version",
        type: "Uint32",
        value: "0"
      },
      {
        vname: "contractOwner",
        type: "ByStr20",
        value: `${address}`
      },
      {
        vname: "name",
        type: "String",
        value: `test`
      },
      {
        vname: "symbol",
        type: "String",
        value: `tst`
      }
    ];

    // Instance of class Contract
    const contract = zilliqa.contracts.new(codeDEX, initDEX);
    console.log(`Deploying DEX`);
    // Deploy the contract.
    // Also notice here we have a default function parameter named toDs as mentioned above.
    // A contract can be deployed at either the shard or at the DS. Always set this value to false.
    const [deployTx, DEX] = await contract.deploy({
      version: VERSION,
      gasPrice: myGasPrice,
      gasLimit: Long.fromNumber(10000)
    });

    // Introspect the state of the underlying transaction
    console.log(`Deployment Transaction ID: ${deployTx.id}`);
    console.log(`Deployment Transaction Receipt:`);
    console.log(deployTx.txParams.receipt);

    // Get the deployed contract address
    console.log("The DEX contract address is:");
    console.log(DEX.address);
    const initCaller = [
      // this parameter is mandatory for all init arrays
      {
        vname: "_scilla_version",
        type: "Uint32",
        value: "0"
      },
      {
        vname: "calleeContract",
        type: "ByStr20",
        value: `${DEX.address}`
      }
    ];
    //Following line added to fix issue https://github.com/Zilliqa/Zilliqa-JavaScript-Library/issues/168
    const deployedContract = zilliqa.contracts.at(DEX.address);
    // Instance of class Contract
    const contractCallee = zilliqa.contracts.new(codeCaller, initCaller);
    console.log(`Deploying Caller`);
    // Deploy the contract.
    // Also notice here we have a default function parameter named toDs as mentioned above.
    // A contract can be deployed at either the shard or at the DS. Always set this value to false.
    const [deployTx1, Caller] = await contractCallee.deploy(
      {
        version: VERSION,
        gasPrice: myGasPrice,
        gasLimit: Long.fromNumber(10000)
      },
      99,
      100,
      true
    );
    console.log(`Deployment Transaction ID: ${deployTx1.id}`);
    console.log(`Deployment Transaction Receipt:`);
    console.log(deployTx1.txParams.receipt);

    // Get the deployed contract address
    console.log("The DEX contract address is:");
    console.log(Caller.address);
    // Create a new timebased message and call setHello
    // Also notice here we have a default function parameter named toDs as mentioned above.
    // For calling a smart contract, any transaction can be processed in the DS but not every transaction can be processed in the shards.
    // For those transactions are involved in chain call, the value of toDs should always be true.
    // If a transaction of contract invocation is sent to a shard and if the shard is not allowed to process it, then the transaction will be dropped.

    console.log("Calling Caller to fetch balance transition with: ");
    const callTx = await Caller.call(
      "fetchBalance",
      [
        {
          vname: "to",
          type: "ByStr20",
          value: address
        },
        {
          vname: "from",
          type: "ByStr20",
          value: address
        },
        {
          vname: "tokenid",
          type: "Uint256",
          value: 1
        }
      ],
      {
        // amount, gasPrice and gasLimit must be explicitly provided
        version: VERSION,
        amount: new BN(0),
        gasPrice: myGasPrice,
        gasLimit: Long.fromNumber(80000)
      },
      99,
      100,
      true
    );

    // Retrieving the transaction receipt (See note 2)
    console.log(JSON.stringify(callTx.receipt, null, 4));

    //Get the contract state
    console.log("Getting contract state...");
    const state = await deployedContract.getState();
    console.log("The state of the contract is:");
    console.log(JSON.stringify(state, null, 4));
  } catch (err) {
    console.log(err);
  }
}

testBlockchain();
