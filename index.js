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
      gasPrice: units.toQa("4000", units.Units.Li),
      gasLimit: Long.fromNumber(10)
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
    library NonfungibleToken
    
    let one_msg = 
      fun (msg : Message) => 
      let nil_msg = Nil {Message} in
    Cons {Message} msg nil_msg
    
    (* Checks and see if an address is a contract owner *)
    let checkContractOwner =
        fun (msgSender: ByStr20) => 
        fun (contractOwner: ByStr20) =>
            builtin eq msgSender contractOwner
    
    (* Checks and see if an address is a token owner *)
    let isTokenOwner = 
        fun (msgSender: ByStr20) =>
        fun (tokenId: Uint256) =>
        fun (tokenOwnerMap_tmp : Map (Uint256) (ByStr20)) =>
            let tokenOwner = builtin get tokenOwnerMap_tmp tokenId in
            match tokenOwner with
            | None => False
            | Some val =>
                builtin eq val msgSender
            end 
    
    (* Checks if a given address is approved to make txn the given tokenID *)
    (* Not to be confused with isApprovedForAll                            *)
    let isApproved = 
        fun (msgSender: ByStr20) =>
        fun (tokenID: Uint256) =>
        fun (approvalMap_tmp: Map (Uint256) (ByStr20)) =>
            let val = builtin get approvalMap_tmp tokenID in
            match val with
            | None => False 
            | Some val =>
                builtin eq val msgSender
            end
    
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
    
    contract NonfungibleToken
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
    
    (* Get the approval of a token to see if one address can transfer a particular tokenId *)
    transition checkApproval(from: ByStr20, to: ByStr20, tokenId: Uint256, callback: String) 
        copy_tokenApprovals <- tokenApprovals;
        copy_operatorApproval <- operatorApprovals;
        checkApproved = isApproved from tokenId copy_tokenApprovals;
        checkApprovedForAll = isApprovedForAll from to copy_operatorApproval;
        match checkApproved with
        | True =>
        msg  = {_tag : callback;
        _recipient : _sender;
        _amount : Uint128 0;
        id: tokenId;
        owner: from};
        msgs = one_msg msg;
        send msgs
        | False =>
            e = let raisedAt = "code_not_authorized" in makeErrorEvent raisedAt code_not_authorized;
            event e
        end
    end
    (* @dev:    Mint new tokens. Only contractOwner can mint the token*)
    (* @param:  to - address of the token recipient                     *)
    (* @param:  tokenId - token id of the new token                     *)
    (* Returns error message code_token_exist if token exists           *)
    transition mint(to: ByStr20, tokenId: Uint256)
    
        (* Sender must be the contract owner *)
        isAuthorized = checkContractOwner contractOwner _sender;
        match isAuthorized with
        | True =>
            currentTokenOwnerMap <- tokenOwnerMap;
            (* Check if token exists *)
            tokenExist <- exists tokenOwnerMap[tokenId];
            match tokenExist with
            | True =>
                (* Token exists, return error code *)
                e = let raisedAt = "mint" in makeErrorEvent raisedAt code_token_exists;
                event e
            | False =>
                (* Mint token *)
                tokenOwnerMap[tokenId] := to;
                (* add to owner count *)
                userCnt <- ownedTokenCount[to];
                match userCnt with
                | Some val =>
                    (* Append to existing results *)
                    newVal= let one = Uint256 1 in builtin add val one;
                    ownedTokenCount[to] := newVal
                | None =>
                    (* User does not have existing tokens *)
                    newVal = Uint256 1;
                    ownedTokenCount[to] := newVal
                end;
    
                (* Emit success event *)
                e = {_eventname: "Mint successful"; by: _sender; recipient: to; token: tokenId};
                event e
            end
        | False =>
            (* Unauthorized transaction - sender is not the contract owner*)
            e = let raisedAt = "mint" in makeErrorEvent raisedAt code_not_authorized;
            event e
        end
    
        
    end
    
    (* @dev Transfer the ownership of a given token ID to another address *)
    (* @param from:     Current owner of the token                        *)
    (* @param to:       Recipient address of the token                    *)
    (* @param tokenId   uint256 id of the token to be transferred         *)
    transition transferFrom(from: ByStr20, to: ByStr20, tokenId: Uint256)
        copy_tokenOwnerMap <- tokenOwnerMap;
        copy_tokenApprovals <- tokenApprovals;
        copy_operatorApproval <- operatorApprovals;
    
        (* Get tokenOwner ByStr20 *)
        getTokenOwner <- tokenOwnerMap[tokenId];
        match getTokenOwner with
        | None =>
            (* Token not found *)
            e = let raisedAt = "transferFrom" in makeErrorEvent raisedAt code_not_found;
            event e
            
        | Some tokenOwner =>
            
            (* Libary functions to check for conditions *)
            checkOwner = isTokenOwner _sender tokenId copy_tokenOwnerMap;
            checkApproved = isApproved _sender tokenId copy_tokenApprovals;
            checkApprovedForAll = isApprovedForAll _sender tokenOwner copy_operatorApproval;
    
            (* Checks if the from is indeed the owner of the token *)
            isFromTokenOwner = builtin eq tokenOwner from;
            match isFromTokenOwner with
            | False =>
                (* From address is not the same as the tokenOwner    *)
                e = let raisedAt = "transferFrom" in makeErrorEvent raisedAt code_bad_request;
                event e
            | True => 
                (* isApprovedOrOwner checks if any of the three conditions are met *)
                isAuthorized = isApprovedOrOwner checkOwner checkApproved checkApprovedForAll;
    
                match isAuthorized with
                | True =>
                    (* Remove from Approval *)
                    match checkApproved with
                    | True =>
                        (* Remove entry from approvals at the token level *)
                        delete tokenApprovals[tokenId] 
                    | False =>
                    end;
    
                    (* Change tokenOwnerMap *)
                    tokenOwnerMap[tokenId] := to;
    
                    (* Change Count *)
                    curr_otc <- ownedTokenCount;
    
                    (*subtract one from previous token owner *)
                    somePrevBal <- ownedTokenCount[from];
                    match somePrevBal with
                    | Some prevBal =>
                        newBal  = let one = Uint256 1 in builtin sub prevBal one;
                        ownedTokenCount[from] := newBal
                    | None =>
                        e = let raisedAt = "transferFrom" in makeErrorEvent raisedAt code_unexpected_error;
                        event e
                    end;
    
                    (* add one to the new token owner *)
                    userCnt <- ownedTokenCount[to];
                    (* Calculate the new token count value for recipient *)
                    newVal = let one = Uint256 1 in match userCnt with
                    | Some val =>
                        (* Add to existing value *)
                        builtin add val one
                    | None => one
                    end;
                    ownedTokenCount[to] := newVal; 
                    e = {_eventname: "transferFrom successful"; from: _sender; recipient: to; token: tokenId}; 
                    event e
                | False =>
                    (* Unauthorized transaction *)
                    e = let raisedAt = "transferFrom" in makeErrorEvent raisedAt code_not_authorized;
                    event e
                end
            end
        end
    end
    
    (* @dev: Approves another address to transfer the given token ID                *)
    (* - There can only be one approved address per token at a given time           *)
    (* - Absence of entry in tokenApproval indicates there is no approved address   *)
    (* param: to ByStr20 to be approved for the given token id                      *)
    (* param: tokenId uint256 id of the token to be apporved                        *)
    
    
    transition approve(to: ByStr20, tokenId: Uint256)
    
        copy_tokenOwnerMap <- tokenOwnerMap;
        copy_operatorApproval <- operatorApprovals;
    
        (* Get tokenOwner ByStr20 *)
        getTokenOwner <- tokenOwnerMap[tokenId];
        match getTokenOwner with
        | None =>
            (* Token not found *)
            e = let raisedAt = "approve" in makeErrorEvent raisedAt code_not_found;
            event e
        | Some tokenOwner =>
            checkApprovedForAll = isApprovedForAll _sender tokenOwner copy_operatorApproval;
            checkOwner = isTokenOwner _sender tokenId copy_tokenOwnerMap;
            isAuthorized = orb checkApprovedForAll checkOwner;
            match isAuthorized with
            | True =>
                (* add to token approval mapping *)
                tokenApprovals[tokenId] := to;
                (* Emit event *)
                e = {_eventname: "Approve successful"; from: _sender; approvedTo: to; token: tokenId};
                event e
            | False =>
                (* Unauthorized transaction *)
                e = let raisedAt = "approve" in makeErrorEvent raisedAt code_not_authorized;
                event e
            end
        end
    end
    
    (* @dev: sets or unsets the approval of a given operator                *)
    (* @param: address to be set or unset as operator                       *)
    (* @param: approved - status of the approval to be set                  *)
    
    transition setApprovalForAll(to: ByStr20, approved: Bool)
    
        copy_operatorApproval <- operatorApprovals;
        (* Checks if the _sender is approving himself *)
        isValidOperation = let check = builtin eq _sender to in negb check;
        (* require _sender is not approving himself *)
        match isValidOperation with
        | True =>
            (* Check if sender has an existing record on the operatorApproval *)
            operatorApprovals[_sender][to] := approved;
            (* Stringify boolean value to be emitted in the event *)
            approvedStr = bool_to_string approved;
            e = {_eventname: "setApprovalForAll successful"; from: _sender; recipient: to; status: approvedStr};
            event e
        | False =>
            e = let raisedAt = "setApprovalForAll" in makeErrorEvent raisedAt code_not_authorized;
            event e
        end
    end`;
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
    transition fetchBalance (contractAddress: ByStr20, msgSender: ByStr20, tokenid: Uint256)
        msg  = {_tag : "checkApproval";
        _recipient : calleeContract;
        _amount : Uint128 0;
        contractAddress: contractAddress;
        msgSender: msgSender;
        tokenID : tokenid;
        callback : "HandleBalance"
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
    const [deployTx, DEX] = await contract.deploy(
      {
        version: VERSION,
        gasPrice: new BN(50000000000),
        gasLimit: new BN(10000)
      },
      50,
      100,
      true
    );

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
    console.log("The Caller contract address is:");
    console.log(Caller.address);
    // Create a new timebased message and call setHello
    // Also notice here we have a default function parameter named toDs as mentioned above.
    // For calling a smart contract, any transaction can be processed in the DS but not every transaction can be processed in the shards.
    // For those transactions are involved in chain call, the value of toDs should always be true.
    // If a transaction of contract invocation is sent to a shard and if the shard is not allowed to process it, then the transaction will be dropped.
    console.log("Minting new token to myself");
    const callMintTx = await DEX.call(
      "mint",
      [
        {
          vname: "to",
          type: "ByStr20",
          value: Caller.address
        },
        {
          vname: "tokenId",
          type: "Uint256",
          value: 1
        }
      ],
      {
        // amount, gasPrice and gasLimit must be explicitly provided
        version: VERSION,
        amount: new BN(0),
        gasPrice: myGasPrice,
        gasLimit: Long.fromNumber(10000)
      },
      99,
      100,
      true
    );
    console.log(JSON.stringify(callMintTx.receipt, null, 4));
    console.log("Calling Caller to fetch balance transition with: ");
    const callTx = await Caller.call(
      "fetchBalance",
      [
        {
          vname: "contractAddress",
          type: "ByStr20",
          value: Caller.address
        },
        {
          vname: "msgSender",
          type: "ByStr20",
          value: address
        },
        {
          vname: "tokenid",
          type: "Uint256",
          value: 0
        }
      ],
      {
        // amount, gasPrice and gasLimit must be explicitly provided
        version: VERSION,
        amount: new BN(0),
        gasPrice: myGasPrice,
        gasLimit: Long.fromNumber(10000)
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
