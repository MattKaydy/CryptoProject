'use strict';
const { Blockchain, Block, Transaction } = require('./blockchain');
const EC = require('elliptic').ec;
const ec = new EC('secp256k1');
const { connect } = require('./mongoUtil');
const prompt = require('prompt-sync')();
const express = require('express');
const app = express();
const request = require('request');
const bodyParser = require('body-parser');
var fs = require('fs');
var ini = require('ini');

var config = ini.parse(fs.readFileSync('./config.ini', 'utf-8'));

async function main(myKey, myWalletAddress, savjeeCoin) {
  let isPromptDone = false;
  let option = '';
  let option2 = '';
  let targetAddress = '';
  let transferCost = '';

  while (isPromptDone === false) {
    console.clear();
    // Print main menu
    console.log('Wecome to COMP4142 Project Demo!');
    console.log('Wallet Address: ' + myWalletAddress);
    console.log('Mining difficulty: ' + savjeeCoin.getLatestBlock().difficulty);
    console.log('Current Mining Reward: ' + savjeeCoin.miningReward);
    console.log(
      'Current Wallet Balance: ' +
        savjeeCoin.getBalanceOfAddress(myWalletAddress)
    );
    console.log('Latest Block Index: ' + savjeeCoin.getLatestBlock().index);
    console.log('My Port:' + config.myPort);

    console.log('==============');
    console.log('Select an action:');
    console.log('1: Show the Whole Blockchain list');
    console.log('2: Show Block Data of Specified Block in the Blockchain');
    console.log('3: Show a Transaction list in a block');
    console.log('4: Create Transaction');
    console.log('5: Show UTXO Pool');
    console.log('6. Mine Block');
    console.log('7. Check networking update');
    console.log('8. Print Neighbor List');
    console.log('0. Exit');

    option = prompt('Enter an option: ');

    if (Number(option) === 0) {
      console.clear();
      console.log('Goodbye! Run node main.js to restart program.');

      isPromptDone = true;
    } else if (Number(option) === 1) {
      console.clear();
      console.log(savjeeCoin.chain);
      option2 = prompt('Press enter to exit');
    } else if (Number(option) === 2) {
      console.clear();
      option2 = prompt('Enter a block index to check its block data: ');
      console.log(savjeeCoin.chain[option2]);
      option2 = prompt('Press enter to exit');
    } else if (Number(option) === 3) {
      console.clear();
      option2 = prompt('Enter a block index to check its transaction list: ');
      console.log(savjeeCoin.chain[option2].transactions);
      option2 = prompt('Press enter to exit');
    } else if (Number(option) === 4) {
      console.clear();

      targetAddress = prompt('Enter sender address: ');
      transferCost = prompt('Enter money to transfer: ');
      const tx1 = new Transaction(
        myWalletAddress,
        'address2',
        Number(transferCost)
      );
      tx1.signTransaction(myKey);
      savjeeCoin.addTransaction(tx1);

      console.log(
        'Transaction added to UTXO. Mine a block to execute the transaction.'
      );
      option2 = prompt('Press enter to exit');
    } else if (Number(option) === 5) {
      console.clear();
      console.log(savjeeCoin.pendingTransactions);
      option2 = prompt('Press enter to exit');
    } else if (Number(option) === 6) {
      console.clear();
      console.log('Mining block to address ' + myWalletAddress + '...');
      await savjeeCoin.minePendingTransactions(myWalletAddress);
      console.log('Block mined to address ' + myWalletAddress + ' !');

      // Post a mined block to peers
      const data = {
        url: 'http://10.11.74.201:1111/postminedblock',
        json: true,
        body: 'savjeeCoin.getLatestBlock()',
      };
      console.log(data.body);
      request.post(data, function (error, response, body) {
        console.log('Post mined block to peers: Success');
        if (!error && response.statusCode === 200) {
          console.log('Peer receive mined block: Success');
          // If peer received invalid block, Synchronised the blockchain.
          const blockchainFromPeer = response.body;
          if (
            blockchainFromPeer != null &&
            savjeeCoin.chain.length < blockchainFromPeer.length
          ) {
            console.log('Synchronising blockchain...');
            savjeeCoin.blockchainJSONToDB(blockchainFromPeer);
            savjeeCoin.constructBlockchain();
            console.log('Synchronised blockchain...');
          }
        }
      });

      option2 = prompt('Press enter to exit');
    } else if (Number(option) === 7) {
      console.clear();
      console.log('Check networking update:');
      await sleep(1000);
      option2 = prompt('Press enter to exit');
    } else if (Number(option) === 8) {
      console.clear();
      console.log(config.nodeList);
      await sleep(1000);
      option2 = prompt('Press enter to exit');
    }
  }
  process.exit();
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

connect('mongodb://localhost:27017/crypto');

app.use(bodyParser.urlencoded({ extended: true }));
// Listen to port
const portNumber = 1111;
app.listen(portNumber, function () {
  console.log('Listening on port ' + portNumber);
});

// Your private key goes here
const myKey = ec.keyFromPrivate(
  '7c4c45907dec40c91bab3480c39032e90049f1a44f3e18c3e07c23e3273995cf'
);

// From that we can calculate your public key (which doubles as your wallet address)
const myWalletAddress = myKey.getPublic('hex');
console.log(myWalletAddress);

// Get blockchain from storage and construct it
const savjeeCoin = new Blockchain();
savjeeCoin.constructBlockchain();

// Post current block.
const data = {
  url: 'http://10.11.74.201:1111/postcurrentblock',
  json: true,
  body: { value: 'test' },
};
request.post(data, function (error, response, body) {
  console.log('Post current block to peers: Success');
  if (!error && response.statusCode === 200) {
    const blockchainFromPeer = response.body;
    if (
      blockchainFromPeer != null &&
      savjeeCoin.chain.length < blockchainFromPeer.length
    ) {
      console.log('Synchronising blockchain...');
      savjeeCoin.blockchainJSONToDB(blockchainFromPeer);
      savjeeCoin.constructBlockchain();
      console.log('Synchronised blockchain...');
    }
  }
});

// receive current block POST
app.post(
  '/postcurrentblock',
  express.urlencoded({ extended: true }),
  async (req, res, next) => {
    try {
      console.log('Receive post current block: Success');
      const blockFromPeer = req.body;
      if (blockFromPeer.hash !== savjeeCoin.getLatestBlock().hash) {
        return res.status(200).send(JSON.stringify(savjeeCoin.chain));
      }
      return res.status(200);
    } catch (err) {
      console.log(err);
      return res.sendStatus(500);
    }
  }
);

// receive mined block from peer
app.post(
  '/postminedblock',
  express.urlencoded({ extended: true }),
  async (req, res, next) => {
    console.log('Received Peer mined block.');
    try {
      const block = req.body;

      // Create Block object
      const blockObj = new Block(
        block.timestamp,
        block.transactions,
        block.previousBlockHash
      );
      blockObj.setIndex(block.index);
      blockObj.setDifficulty(block.difficulty);
      blockObj.setNonce(block.nonce);
      blockObj.setRoot(block.root);

      if (blockObj.previousBlockHash === savjeeCoin.getLatestBlock.hash) {
        savjeeCoin.chain.push(blockObj);
        blockObj.saveBlockToDB();
      }
      return res.status(200);
    } catch (err) {
      console.log(err);
      return res.sendStatus(500);
    }
  }
);

main(myKey, myWalletAddress, savjeeCoin);
