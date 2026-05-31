require("dotenv").config();

const TelegramBot = require("node-telegram-bot-api");
const { ethers } = require("ethers");

// =======================
// TELEGRAM TOKEN
// =======================
const TOKEN = process.env.TOKEN;

if (!TOKEN) {
  console.error("TOKEN not found in .env file");
  process.exit(1);
}

// ساخت ربات
const bot = new TelegramBot(TOKEN, {
  polling: true
});


const RPCS = [
  "https://bsc-dataseed.binance.org/",
  "https://rpc.ankr.com/bsc",
  "https://bsc.publicnode.com"
];

let provider;
let contract;

const CONTRACT_ADDRESS = "0x6bD7671Ec2B11Dc32F204641d67084977E5C81f9";

const abi = [
  "function ownerInfo(address owner) view returns(uint64,uint32,uint32,uint32,uint32,uint8,bool,address,address,address)"
];

async function connect() {
  for (const rpc of RPCS) {
    try {
      const p = new ethers.JsonRpcProvider(rpc);
      await p.getBlockNumber();
      provider = p;
      console.log("CONNECTED:", rpc);
      return;
    } catch (e) {}
  }
  throw new Error("RPC FAILED");
}

async function init() {
  await connect();

  contract = new ethers.Contract(
    CONTRACT_ADDRESS,
    abi,
    provider
  );

  console.log("BOT RUNNING...");
}

init();

async function checkUser(userAddress) {
  let current = userAddress;

  const visited = new Set();
  const balancedMap = new Map();

  while (current && current !== ethers.ZeroAddress) {

    if (visited.has(current)) break;
    visited.add(current);

    try {
      const info = await contract.ownerInfo(current);
      const parent = info[7];

      if (!parent || parent === ethers.ZeroAddress) break;

      const parentInfo = await contract.ownerInfo(parent);

      let left = Number(parentInfo[3]);
      let right = Number(parentInfo[4]);

      const isRight = info[6];

      if (isRight) right++;
      else left++;

      const before = Math.min(
        Number(parentInfo[3]),
        Number(parentInfo[4])
      );

      const after = Math.min(left, right);

      const balancedNow = after > before;

      if (balancedNow) {
        balancedMap.set(
          parent,
          (balancedMap.get(parent) || 0) + 1
        );
      }

      current = parent;

    } catch (e) {
      break;
    }
  }

  return balancedMap;
}

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!ethers.isAddress(text)) {
    bot.sendMessage(chatId, " آدرس بفرست");
    return;
  }

  bot.sendMessage(chatId, " در حال بررسی...");

  try {
    const result = await checkUser(text);

    if (result.size === 0) {
      bot.sendMessage(chatId, " هیچ یوزر پیدا نشد");
      return;
    }

    let output = "BALANCED USERS SUMMARY\n\n";

    let i = 1;

    for (const [address, count] of result.entries()) {
      output += `${i}. ${address}\n`;
      output += `Count: ${count}\n`;
      output += "-------------------\n";
      i++;
    }

    output += `\nTOTAL USERS: ${result.size}`;

    bot.sendMessage(chatId, output);

  } catch (err) {
    bot.sendMessage(chatId, "Error: " + err.message);
  }
});