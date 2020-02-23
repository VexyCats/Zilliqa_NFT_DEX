const { BN, Long, bytes, units } = require("@zilliqa-js/util");
const { Zilliqa } = require("@zilliqa-js/zilliqa");
const {
  toBech32Address,
  getAddressFromPrivateKey,
  toChecksumAddress
} = require("@zilliqa-js/crypto");

const zilliqa = new Zilliqa("https://dev-api.zilliqa.com");
var fs = require("fs");

require.extensions[".scilla"] = function(module, filename) {
  module.exports = fs.readFileSync(filename, "utf8");
};

var codeDEX = require("./Contracts/NFT_DEX.scilla");
// These are set by the core protocol, and may vary per-chain.
// You can manually pack the bytes according to chain id and msg version.
// For more information: https://apidocs.zilliqa.com/?shell#getnetworkid
var NFT = require("./Contracts/ZRC-1.scilla");

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
        vname: "one",
        type: "Uint256",
        value: 1
      }
    ];

    // Instance of class Contract
    const contract = zilliqa.contracts.new(codeDEX, initDEX);
    console.log(`Deploying DEX`);
    //Deploy the contract.
    //Also notice here we have a default function parameter named toDs as mentioned above.
    //A contract can be deployed at either the shard or at the DS. Always set this value to false.
    const [deployTx, DEX] = await contract.deploy({
      version: VERSION,
      gasPrice: myGasPrice,
      gasLimit: Long.fromNumber(40000)
    });

    // // check the pending status
    // const pendingStatus = await zilliqa.blockchain.getPendingTxn(deployTx.id);
    // console.log(`Pending status is: `);
    // console.log(pendingStatus.result);
    // Introspect the state of the underlying transaction
    console.log(`Deployment Transaction ID: ${deployTx.id}`);
    console.log(`Deployment Transaction Receipt:`);
    console.log(deployTx.txParams.receipt);

    // Get the deployed contract address
    console.log("The contract address is:");
    console.log(DEX.address);
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
    console.log(DEX.address);
    console.log("The DEX checksum contract address is:");
    console.log(toChecksumAddress(DEX.address));
    const initCaller = [
      // this parameter is mandatory for all init arrays
      /*
contractOwner : ByStr20,
 name : String,
 symbol: String
      */
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
        value: "name"
      },
      {
        vname: "symbol",
        type: "String",
        value: "sym"
      }
    ];
    //Following line added to fix issue https://github.com/Zilliqa/Zilliqa-JavaScript-Library/issues/168
    // const deployedContract = zilliqa.contracts.at(
    //   toChecksumAddress(DEX.address)
    // );
    // Instance of class Contract
    const contractCallee = zilliqa.contracts.new(NFT, initCaller);
    console.log(`Deploying NFT`);
    // Deploy the contract.
    // Also notice here we have a default function parameter named toDs as mentioned above.
    // A contract can be deployed at either the shard or at the DS. Always set this value to false.
    const [deployTx1, Caller] = await contractCallee.deploy(
      {
        version: VERSION,
        gasPrice: myGasPrice,
        gasLimit: Long.fromNumber(40000)
      },
      false
    );

    // // check the pending status
    // const pendingStatus1 = await zilliqa.blockchain.getPendingTxn(deployTx1.id);
    // console.log(`Pending status is: `);
    // console.log(pendingStatus1.result);

    // process confirm
    console.log(`The transaction id is:`, deployTx1.id);
    console.log(`Waiting transaction be confirmed`);
    const confirmedTxn1 = await deployTx1.confirm(deployTx1.id);

    console.log(`The transaction status is:`);
    console.log(confirmedTxn1.receipt);

    if (confirmedTxn1.receipt.success !== true) {
      return;
    }

    // Get the deployed contract address
    console.log(Caller.address);
    console.log("The NFT checksum contract address is:");
    console.log(toChecksumAddress(Caller.address));

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
    console.log(JSON.stringify(state, null, 4));
  } catch (err) {
    console.log(err);
  }
}

testBlockchain();
