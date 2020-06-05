const { BN, Long, bytes, units } = require("@zilliqa-js/util");
const { Zilliqa } = require("@zilliqa-js/zilliqa");
const {
  toBech32Address,
  getAddressFromPrivateKey,
  toChecksumAddress,
} = require("@zilliqa-js/crypto");

const zilliqa = new Zilliqa("https://dev-api.zilliqa.com");
var fs = require("fs");

require.extensions[".scilla"] = function (module, filename) {
  module.exports = fs.readFileSync(filename, "utf8");
};

var codeDEX = `scilla_version 0

(***************************************************)
(*               Associated library                *)
(***************************************************)
import BoolUtils ListUtils

library NFTDEX

let one_msg = 
  fun (msg : Message) => 
  let nil_msg = Nil {Message} in
Cons {Message} msg nil_msg

let two_msgs =
fun (msg1 : Message) =>
fun (msg2 : Message) =>
  let msgs_tmp = one_msg msg2 in
  Cons {Message} msg1 msgs_tmp
        
let checkOrderStatus = 
    fun (orderStatus: String) =>
    fun (requiredStatus: String) =>
        builtin eq orderStatus requiredStatus



(*ByStr20 - Address of owner*)
(*Uint256 - price*)
(*ByStr20 - address of contract *)
(*Uint256 - token id*)
(*Uint256 listingID*)

 type Order =
| Order of ByStr20 Uint128 ByStr20 Uint256 Uint256 String 

(* Error events *)
let makeErrorEvent =
    fun (location: String) =>
    fun (errorCode: Uint32) =>
        {_eventname: "Error"; raisedAt: location; code: errorCode }

(* Error codes *)

let code_success = Uint32 0
let code_failure = Uint32 1
let code_not_authorized = Uint32 2
let order_wrong_state = Uint32 3
let order_not_found = Uint32 4
let dex_not_approved_to_transfer = Uint32 5
let code_token_exists = Uint32 6
let payment_amount_error = Uint32 7
let code_unexpected_error = Uint32 9


(***************************************************)
(*             The contract definition             *)
(***************************************************)

contract NFTDEX
(contractOwner : ByStr20,
one : Uint256)

(* mutable fields *)
(*Order IDs - use global variable to track order numbers *)
field orderID : Uint256 = Uint256 0
(* Orderbook: mapping (orderId => ( Order struct ) *)
field orderbook : Map Uint256 Order
                  = Emp Uint256 Order
field temp_orderbook : Map ByStr20 (Map Uint256 Order)
                            = Emp ByStr20 (Map Uint256 Order)         

(* Mapping between owner and all their orders *)
field orderOwnerList: Map ByStr20 (List Uint256) = Emp ByStr20 (List Uint256)
(* Fee taken from each purchase, 10% of price *)
field dexFee: Uint128 = Uint128 10


(* Prceedures *)
procedure checkApproved (contractAddress: ByStr20, tokenID: Uint256)
     e = { _eventname : "Sender for approval check is: "; msgsender: _sender};
        event e;
  self_DEX = _this_address;
  zero = Uint128 0;
    isApprovedCall = {_tag: "getApproved";
    _recipient: contractAddress;
    _amount: zero;
    tokenID: tokenID
    };
    msgs = one_msg isApprovedCall;
    send msgs

end
(* @dev Transfer the ownership of a given token ID to another address*)
(*@param contractAddress - address of NFT contract*)
(*@param tokenID - address of NFT contract*)
procedure transferNFTtoOwner (contractAddress: ByStr20, tokenID: Uint256, owner: ByStr20)
  zero = Uint128 0;
    transfered = {_tag: "transfer";
    _recipient: contractAddress;
    _amount: zero;
    to: owner;
    tokenID: tokenID
        };
    msgs = one_msg transfered;
    e = { _eventname : "Transfer NFT back to owner"; tokenID: tokenID};
    event e;
    send msgs
end
(* @dev Transfer the ownership of a given token ID to this address*)

(*@param contractAddress - address of NFT contract*)
(*@param tokenID - address of NFT contract*)
procedure transferNFTtoDEX (contractAddress: ByStr20, tokenID: Uint256)
(* take params and make a call to transfer NFT to self.*)
 self_DEX = _this_address;
  zero = Uint128 0;
    transfered = {_tag: "transferFrom";
    _recipient: contractAddress;
    _amount: zero;
    from: _sender;
    to: self_DEX;
    tokenID: tokenID
    };
    msgs = one_msg transfered;
    e = { _eventname : "Transfer NFT to DEX"; tokenID: tokenID};
    event e;
    send msgs
end
(* Create a listing and sell an NFT*) 
(* First call from frontend. User wants to post an item for sale. They call this function *)
(* then it will check if approval is okay, if so, then it will transfer 721 to itself, *)
(* and create the listing information and publish it as an item for sale *)
transition sell (contractAddress: ByStr20, tokenID: Uint256, price: Uint128)    
    (* Create a temporary order that is pending to be used as reference in callbacks*)
    liststate  = "PENDING";
    orderid <- orderID;
    newOrder = Order _sender price contractAddress tokenID orderid liststate;
    temp_orderbook[contractAddress][tokenID] := newOrder;
    orderid = builtin add orderid one;
    orderID := orderid; 
     e = {_eventname : "Order Pending Successful"; extracted_orderid : orderid; order: newOrder};
     event e;
     (* Check approval to see if we can transfer*)
    checkApproved contractAddress tokenID 
end

(*Callback Transitions*)
transition getApprovedCallBack(approved_addr: ByStr20, tokenID: Uint256)
(* called back from NFT contract if approved*)  
(* get variables *)
  is_sender = builtin eq _this_address approved_addr;
     match is_sender with
        |False =>
            (*Not approved to transfer NFT*)
           delete temp_orderbook[_sender][tokenID];
           e = let raisedAt = "dex_not_approved_to_transfer" in makeErrorEvent raisedAt  dex_not_approved_to_transfer;
            event e
        | True =>
            (*Approved to transfer NFT - call TransferFrom on NFT*)
            tempOrder <- temp_orderbook[_sender][tokenID];
            match tempOrder with 
                 |Some (Order owner price contractaddress tokenID orderid liststate) => 
                      (* creating listing and storing in listing mappings*)
                    tempPending = "PENDING";
                    is_pending = checkOrderStatus tempPending liststate;   
                    match is_pending with
                        |True =>
                             e = {_eventname : "Token Approved Successfully - Now calling transfer"; extracted_orderid : orderid; token_id: tokenID};
                            event e;
                            transferNFTtoDEX owner tokenID
                        |False =>
                            e = let raisedAt = "order_wrong_state" in makeErrorEvent raisedAt order_wrong_state;
                            event e
                        end
                 |None => 
                        (* failure, order not found - fire off events *)
                        e = let raisedAt = "order_not_found" in makeErrorEvent raisedAt order_not_found;
                         event e
                      end
                      
          
            end
 end

transition transferFromSuccessCallBack(from: ByStr20, to: ByStr20, tokenID: Uint256)
    tempOrder <- temp_orderbook[_sender][tokenID];
            match tempOrder with 
                 |Some (Order owner price contractaddress tokenID orderid liststate) => 
                      (* creating listing and storing in listing mappings*)
                      tempPending = "PENDING";
                      is_pending = checkOrderStatus tempPending liststate;   
                      (*Approved to transfer NFT - check orderID is pending*)
                    match is_pending with
                        |True =>
                        (* Store listing info inside the owners mappings and order mappings for references *)
                         state = "ACTIVE";
                         newOrder = Order owner price contractaddress tokenID orderid state;
                         orderbook[orderid] := newOrder;
                         delete temp_orderbook[contractaddress][tokenID];
                         orderList <- orderOwnerList[owner];
                    match orderList with 
                        |Some v =>
                         new_lists = Cons {Uint256} orderid v;
                         orderOwnerList[owner] := new_lists;
                         e = {_eventname : "Order Listed Successful"; extracted_orderid : orderid; order: newOrder};
                         event e
                        |None=>
                                  (* failure, order not pending - fire off events *)
                         e = {_eventname : "Order owner list mismatch"; extracted_order : orderid; order_state: orderList};
                         event e
                         end
                        |False =>
                         (* failure, order not pending - fire off events *)
                         e = let raisedAt = "order_wrong_state" in makeErrorEvent raisedAt order_wrong_state;
                         event e
                         end
                    |None => 
                        (* failure, order not found - fire off events *)
                        e = let raisedAt = "order_not_found" in makeErrorEvent raisedAt order_not_found;
                         event e
            end
                      
end

(* Purchase an order/NFT that is for sale*)     
transition purchase (orderID: Uint256)    
accept;
listing <- orderbook[orderID];
dexFEE <- dexFee;
    match listing with
    |Some (Order owner price contractaddress tokenID orderid liststate) =>  
           tempActive = "ACTIVE";
           is_active = checkOrderStatus tempActive liststate;  
                match is_active with
                |True => 
                    (*Order is active! Check amount is right*)
                is_amount_correct = builtin eq _amount price;
                match is_amount_correct with
                    |True => 
                        (* amount is correct go ahead and remove order and transfer NFT plus funds*)
                        (* remove fee from the purchase amount*)
                        sellersAmount = builtin sub _amount dexFEE;
                        (* Edit the listing state and update the orderbook*)
                         state = "SOLD";
                         newOrder = Order _sender price contractaddress tokenID orderid state;
                         orderbook[orderID] := newOrder;
                         (* transfer NFT to new owner*)
                         (* ==== QUESTION ==== : Can I call transferNFT and THEN transfer ZIL to owner within this one procedure using two_msgs?*)
                           zero = Uint128 0;
                        nftTransfered = {_tag: "transfer";
                        _recipient: contractaddress;
                        _amount: zero;
                        to: _sender;
                        tokenID: tokenID
                            };
                        sendPayment = {_tag : ""; _recipient : owner; _amount : sellersAmount};
                        e = { _eventname : "Transfer NFT back to owner and send payment to seller"; order: orderID; tokenID: tokenID; buyers_address: _sender; seller_payment : sellersAmount; seller_address : owner};
                        event e;
                        msgs = two_msgs nftTransfered sendPayment;
                        send msgs
                         
                    |False =>
                        e = let raisedAt = "payment_amount_error" in makeErrorEvent raisedAt payment_amount_error;
                        event e 
                    end
                |False => 
                 (* failure, order is not active *)
                    e = {_eventname : "Order State invalid"; extracted_order : orderid; order_state: liststate};
                    event e
                end
    |None => 
           (* failure, order not found - fire off events *)
            e = let raisedAt = "order_not_found" in makeErrorEvent raisedAt order_not_found;
            event e 
    end

end

(* Cancel a a listing, remove it, and transfer NFT back to owner*) 
(* Only performed by owner of listing*)
transition cancelListing (orderID : Uint256)
    listing <- orderbook[orderID];
    match listing with
    |Some (Order owner price contractaddress tokenID orderid liststate) =>  
        (*check if owner of order*)
        is_owner = builtin eq _sender owner;
        match is_owner with
        |True => 
            (*Sender is owner*)
           tempActive = "ACTIVE";
           is_active = checkOrderStatus tempActive liststate;  
                match is_active with
                |True => 
                    (*Order is active! Go ahead and delete and return NFT*)
                    delete orderbook[orderID];
                    e = {_eventname : "Order Canceled"; extracted_order : orderid};
                    event e;
                    (*transfer NFT to owner*)
                    transferNFTtoOwner contractaddress tokenID owner
                |False => 
                 (* failure, order is not active *)
                    e = {_eventname : "Order State invalid"; extracted_order : orderid; order_state: liststate};
                    event e
                end
        |False =>
         (* failure, sender not owner *)
            e = let raisedAt = "code_not_authorized" in makeErrorEvent raisedAt code_not_authorized;
                         event e 
        end
    |None => 
           (* failure, order not found - fire off events *)
            e = let raisedAt = "order_not_found" in makeErrorEvent raisedAt order_not_found;
            event e 
    end
end
(* admin functions *)
    
(*Withdrawal balance of contract *)
transition withdrawal (to: ByStr20)
  is_contractOwner = builtin eq _sender contractOwner;
      match is_contractOwner with
        |True => 
            (* get current balance *)
          bal <- _balance;
            e = {_eventname : "Withdrawaling Balance"; withdrawal_amount : bal; to: _sender};
            event e;
            withdrawal = {_tag : ""; _recipient : contractOwner; _amount : bal};
            msgs = one_msg withdrawal;
            send msgs
        |False =>
        (* failure, sender not owner *)
            e = let raisedAt = "code_not_authorized" in makeErrorEvent raisedAt code_not_authorized;
            event e 
        end
end
(* Cancel an order and refund the NFT *)
(* only performed by admin*)
transition cancelOrder (orderID: Uint256)
    is_contractOwner = builtin eq _sender contractOwner;
      match is_contractOwner with
        |True => 
           listing <- orderbook[orderID];
           match listing with
           |Some (Order owner price contractaddress tokenID orderid liststate) =>  
                         (* Edit the listing state and update the orderbook*)
                         state = "CANCELLED";
                         newOrder = Order owner price contractaddress tokenID orderid state;
                         orderbook[orderID] := newOrder;
                         e = {_eventname : "Admin cancelled Order"; order_ID : orderID; new_state: state};
                         event e;
                        (*transfer NFT to owner*)
                        transferNFTtoOwner contractaddress tokenID owner
                       
            |None =>
                  (* failure, order not found - fire off events *)
                   e = let raisedAt = "order_not_found" in makeErrorEvent raisedAt order_not_found;
                   event e 
            end
        |False =>
        (* failure, sender not owner *)
            e = let raisedAt = "code_not_authorized" in makeErrorEvent raisedAt code_not_authorized;
            event e 
        end
        
end

(* send NFT to person in case something goes wrong - to return their NFT *)
transition transferNFT (contractAddress : ByStr20, tokenID: Uint256, to: ByStr20)
  is_contractOwner = builtin eq _sender contractOwner;
      match is_contractOwner with
        |True =>
            transferNFTtoOwner contractAddress tokenID to
        |False =>
        (* failure, sender not owner *)
            e = let raisedAt = "code_not_authorized" in makeErrorEvent raisedAt code_not_authorized;
            event e 
        end
end
transition changeDEXfee (fee: Uint128)
  is_contractOwner = builtin eq _sender contractOwner;
  oldDEXfee <- dexFee;
      match is_contractOwner with
        |True =>
        dexFee := fee;
        e = {_eventname : "DEX fee changed"; previous_Amount : oldDEXfee; new_fee: fee};
        event e
        |False =>
        (* failure, sender not owner *)
            e = let raisedAt = "code_not_authorized" in makeErrorEvent raisedAt code_not_authorized;
            event e 
        end
end
`;

const chainId = 333; // chainId of the developer testnet
const msgVersion = 1; // current msgVersion
const VERSION = bytes.pack(chainId, msgVersion);

// Populate the wallet with an testnet dev account
const privateKey =
  "3375F915F3F9AE35E6B301B7670F53AD1A5BE15D8221EC7FD5E503F21D3450C8";

zilliqa.wallet.addByPrivateKey(privateKey);

const address = getAddressFromPrivateKey(privateKey);
console.log(`My account address is: ${address}`);
console.log(`My account bech32 address is: ${toBech32Address(address)}`);
const DEX_Address = "0x0FB8554E158605FE973056f33fd6986f00F27D1D";
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

    /*let tx = zilliqa.transactions.new({
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

    // Deploy a contract*/
    console.log(`Deploying a new contract....`);

    // Get the deployed contract address
    console.log("The contract address is:");
    console.log(DEX_Address);
    //process confirm
    // console.log(`The transaction id is:`, deployTx.id);
    // console.log(`Waiting transaction be confirmed`);
    // const confirmedTxn = await deployTx.confirm(deployTx.id);

    // console.log(`The transaction status is:`);
    // console.log(confirmedTxn.receipt);

    // if (confirmedTxn.receipt.success !== true) {
    //   return;
    // }

    //Get the deployed contract address
    console.log("The DEX contract address is:");
    console.log(DEX_Address);
    console.log("The DEX checksum contract address is:");
    console.log(toChecksumAddress(DEX_Address));

    //Following line added to fix issue https://github.com/Zilliqa/Zilliqa-JavaScript-Library/issues/168
    // const deployedContract = zilliqa.contracts.at(
    //   toChecksumAddress(DEX.address)
    // );
    // Instance of class Contract
    const contract = await zilliqa.contracts.at(DEX_Address);
    console.log(`Deploying NFT`);
    // Deploy the contract.
    // Also notice here we have a default function parameter named toDs as mentioned above.
    // A contract can be deployed at either the shard or at the DS. Always set this value to false.
    const DEXContract = await contract.call(
      "sell",
      [
        {
          vname: "contractAddress",
          type: "ByStr20",
          value: "0xC57F328b69561BCB502CafAfF78b2A31f4a20814",
        },
        {
          vname: "tokenID",
          type: "Uint256",
          value: "5",
        },
        {
          vname: "price",
          type: "Uint128",
          value: "5",
        },
      ],
      {
        version: VERSION,
        amount: new BN(0),
        gasPrice: myGasPrice,
        gasLimit: Long.fromNumber(10000),
        priority: true,
      },
      66,
      1000,
      true
    );
    console.log(DEXContract);

    // // check the pending status
    // const pendingStatus1 = await zilliqa.blockchain.getPendingTxn(deployTx1.id);
    // console.log(`Pending status is: `);
    // console.log(pendingStatus1.result);

    // process confirm
    console.log(`The transaction id is:`, DEXContract.id);
    console.log(`Waiting transaction be confirmed`);

    console.log(`The transaction status is:`);
    console.log(DEXContract.receipt);

    if (DEXContract.receipt.success !== true) {
      console.log("contract tx failed");
      console.log(DEXContract.receipt);
      return;
    }

    // Get the deployed contract address
    /*

    // Create a new timebased message and call setHello
    // Also notice here we have a default function parameter named toDs as mentioned above.
    // For calling a smart contract, any transaction can be processed in the DS but not every transaction can be processed in the shards.
    // For those transactions are involved in chain call, the value of toDs should always be true.
    // If a transaction of contract invocation is sent to a shard and if the shard is not allowed to process it, then the transaction will be dropped.
    console.log("Minting new token to myself");
    const callMintTx = await Caller.call(
      "mint",
      [
        {
          vname: "to",
          type: "ByStr20",
          value: toChecksumAddress(Caller.address)
        },
        {
          vname: "tokenId",
          type: "Uint256",
          value: 1
        },
        {
          vname: "token_uri",
          type: "String",
          value: "google.com"
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
      1000,
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
          value: toChecksumAddress(Caller.address)
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
      1000,
      true
    );

    // Retrieving the transaction receipt (See note 2)
    console.log(JSON.stringify(callTx.receipt, null, 4));

    //Get the contract state
    console.log("Getting contract state...");
    const state = await deployedContract.getState();
    console.log("The state of the contract is:");
    console.log(JSON.stringify(state, null, 4));*/
  } catch (err) {
    console.log(err);
  }
}

testBlockchain();
