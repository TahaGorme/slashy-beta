// Import required modules
import axios from "axios";
import chalk from "chalk";
import { Client } from "discord.js-selfbot-v13";
import express from "express";
import monitor from "express-status-monitor";
import { FormData } from "formdata-node";
import auth from "http-auth";
import { connect } from "puppeteer-real-browser";

// Import node-native modules
import fs from "node:fs";
import path from "node:path";

// Import utilities
import { Logger } from "./Logger.js";

// Configuration object
import CONFIG from "../config.js";

//commands which will prevent the bot from executing other commands
let BLOCKING_COMMANDS = ["postmemes"];

// Global error handlers
process.on("unhandledRejection", (error) => {
  Logger.error(`Something went wrong with a promise: ${error.stack}`);
});

process.on("uncaughtException", (error) => {
  Logger.error(`An unexpected error occurred: ${error.stack}`);
});

const app = express();
const basic = auth.basic(
  { realm: "Monitor Area" },
  function (user, pass, callback) {
    callback(
      user === CONFIG.WEBSITE_USERNAME && pass === CONFIG.WEBSITE_PASSWORD
    );
  }
);

// Set '' to config path to avoid middleware serving the html page (path must be a string not equal to the wanted route)
let statusMonitor = monitor({ path: "" });

app.use(statusMonitor.middleware);
app.get("/status", basic.check(statusMonitor.pageRoute)); // use the pageRoute property to serve the dashboard html page

app.listen(3000, () => {
  console.log("Server listening on port 3000");
});

// List of available commands to automatically queue
let AVAILABLE_COMMANDS = [
  "highlow",
  "beg",
  "postmemes",
  "search",
  "hunt",
  "dig",
  "crime",
];
// if (CONFIG.IS_FISHING_ENABLED) {
//   //remove postmemes from the list of available commands if fishing is enabled
//   AVAILABLE_COMMANDS = AVAILABLE_COMMANDS.filter((cmd) => cmd !== "postmemes");
// }

async function processTokens() {
  const tokens = fs.readFileSync("tokens.txt", "utf-8")
    .split("\n")
    .map(token => token.trim())
    .filter(Boolean);

  for (const token of tokens) {
    console.log(`Logging in with token: ${token}`);
    slashy(token);

    await new Promise(resolve => setTimeout(resolve, randomInt(CONFIG.LOGIN_DELAY_MIN, CONFIG.LOGIN_DELAY_MAX)));
  }
}

processTokens().catch(console.error);

async function slashy(token) {
  const client = new Client();

  // Add this function where other helper functions are defined
  function startRandomCommandScheduler() {
    // Function to push random commands to queue
    function pushRandomCommand() {
      const availableCommands = AVAILABLE_COMMANDS.filter(
        (cmd) =>
          !CommandManager.cooldowns[cmd] ||
          Date.now() >= CommandManager.cooldowns[cmd]
      );

      if (availableCommands.length > 0) {
        const randomCommand =
          availableCommands[randomInt(0, availableCommands.length - 1)];

        if (!CommandManager.queue.some((cmd) => cmd.name === randomCommand)) {
          CommandManager.addCommand(randomCommand);
        }
      }
    }

    // Start interval with random delay between 500-1000ms
    setInterval(pushRandomCommand, randomInt(500, 1000));
  }

  // State management
  const State = {
    isSelling: false, // Flag to indicate if the bot is selling fish
    isFishing: false, // Flag to indicate if the bot is fishing
    isPredicting: false, // Flag to indicate if the bot is predicting
    isBotAbleToFish: true, // Flag to indicate if the bot is able to fish
    lastFishTimestamp: 0, // Timestamp of the last fish
    isBotBusy: false, // Flag to indicate if the bot is busy
    bucketSpace: 0, // Current bucket space
    maxBucketSpace: 0, // Maximum bucket space,
    inventory: [], // Inventory items
    lastStreamTimestamp: 0, // Timestamp of the last stream
    isStreamStillRunning: true, // Flag to indicate if the stream is still running
    thingsToBuy: [], // Items to buy
    latestBuyQuantity: 0, // Latest buy quantity
    streamingFlag: false,
    lastButtonClick: undefined,
    lastButtonClickTimestamp: 0,
    lastUsedCommand: undefined,
    lastUsedCommandOptions: undefined,
    lastCommandTimestamp: 0,
  };

  // Command management
  const CommandManager = {
    queue: [],
    cooldowns: {},
    channel: null,

    async addCommand(command, options = null) {
      this.queue.push({ name: command, options });
    },

    async processQueue() {
      // Prevent execution if the bot is busy or the queue is empty
      if (State.isBotBusy || this.queue.length === 0) return;
      // Move blocking commands to the 2nd position in the queue
      while (
        BLOCKING_COMMANDS.includes(this.queue[0].name) &&
        (State.isFishing || State.isSelling || State.isPredicting)
      ) {
        this.queue.splice(1, 0, this.queue.shift());
      }
      // Find the first valid command in the queue with no cooldown
      const validCommandIndex = this.queue.findIndex(
        (cmd) =>
          !this.cooldowns[cmd.name] || Date.now() >= this.cooldowns[cmd.name]
      );

      if (validCommandIndex === -1) return;

      try {
        State.isBotBusy = true;
        // Remove the command from the queue and execute
        const command = this.queue.splice(validCommandIndex, 1)[0];

        Logger.game(`Executing command: ${command.name}`);
        await this.channel.sendSlash(
          CONFIG.BOT_ID,
          command.name,
          ...(command.options || [])
        );
        State.lastUsedCommand = command.name;
        State.lastUsedCommandOptions = command.options;
        State.lastCommandTimestamp = Date.now();

        this.cooldowns[command.name] =
          Date.now() + (CONFIG.COOLDOWNS[command.name] || 2500);
      } catch (error) {
        Logger.error(`Failed to execute command: ${error.message}`);
      } finally {
        State.isBotBusy = false;
      }
    },
  };
  const moves = JSON.parse(fs.readFileSync("moves.json", "utf-8"));

  // Fishing game handler
  const FishingGame = {
    async handleMinigame(message, image) {
      // Prevent execution if the bot is already fishing or the image is missing
      if (!image || State.isFishing) return;
      State.isFishing = true;
      Logger.fish("Started fishing minigame");

      try {
        // Get prediction from the image using the API
        const prediction = await this.getPrediction(image);
        await this.executeMoves(message, prediction);
      } catch (error) {
        console.error("[ERROR] Fishing minigame failed:", error);
        await this.executeFailsafe(message);
      } finally {
        State.isFishing = false;
      }
    },

    async getPrediction(image) {
      State.isBotBusy = true;
      const startTime = Date.now();
      const imageResponse = await axios.get(image, {
        responseType: "arraybuffer",
      });
      const imagePath = path.join(__dirname, "fishy.png");
      fs.writeFileSync(imagePath, imageResponse.data);

      const apiStartTime = Date.now();
      const formData = new FormData();
      formData.append("image", fs.createReadStream(imagePath));

      const response = await axios.post(CONFIG.API_ENDPOINT, formData, {
        headers: formData.getHeaders(),
      });

      const apiEndTime = Date.now();
      const apiTimeTaken = (apiEndTime - apiStartTime) / 1000;
      console.log(
        `${client.user.username}: API response took ${apiTimeTaken} seconds.`
      );
      console.log(`${client.user.username}: API response:`, response.data);

      if (response.status !== 200) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const detections = response.data.grid_positions;
      if (!detections) {
        throw new Error("No grid positions found in the API response.");
      }

      let rodPosition = null;
      let seaBombPosition = null;
      let latestFishingSpot = null;

      detections.forEach((detection) => {
        const { grid_x, grid_y, class: objectClass } = detection;
        const gridCell = `${grid_y},${grid_x}`;
        if (objectClass === "Hand" || objectClass === "Fishing Rod") {
          rodPosition = gridCell;
        } else if (objectClass === "Fishing Spot") {
          latestFishingSpot = gridCell;
        } else if (objectClass === "Sea Bomb") {
          seaBombPosition = gridCell;
        }
      });

      if (!rodPosition || !latestFishingSpot) {
        throw new Error(
          "Required positions (Hand, Fishing Rod, or Fishing Spot) not found in the API response."
        );
      }

      return { rodPosition, latestFishingSpot, seaBombPosition };
    },

    async executeMoves(
      message,
      { rodPosition, latestFishingSpot, seaBombPosition }
    ) {
      const key = `${latestFishingSpot}-${seaBombPosition}`;
      const moveSet = moves[key];
      if (moveSet) {
        for (const move of moveSet) {
          const buttonIndex = {
            up: 1,
            down: 3,
            left: 0,
            right: 4,
            2: 2,
          }[move];
          await clickButton(message, buttonIndex, 0);
        }
      } else {
        await this.executeFailsafe(message);
      }
      State.isBotBusy = false;
    },

    async executeFailsafe(message) {
      if (message.components[0].components[4]) {
        await clickButton(message, 4, 0);
        await new Promise((r) => setTimeout(r, randomInt(100, 300)));
        await clickButton(message, 2, 0);
      } else {
        await clickButton(message, 2, 0);
      }
    },
  };

  // Handle updates to bucket space
  async function updateBucketSpace(message) {
    const [current, total] = message.embeds[1].description
      .match(/(\d+) \/ (\d+)/)
      .slice(1)
      .map(Number);
    State.bucketSpace = current;
    State.maxBucketSpace = total;
  }

  // Handle high-low minigame
  async function handleHighLowGame(message) {
    try {
      const secretNumber = parseInt(
        message.embeds[0].description.match(/\*\*(\d+)\*\*/)[1]
      );
      // await message.clickButton({ X: secretNumber > 50 ? 0 : 2, Y: 0 });
      await clickButton(message, secretNumber > 50 ? 0 : 2, 0);
    } catch (error) {
      console.error("[ERROR] High-low game failed:", error);
    }
  }

  // Handle bucket viewing and management
  async function handleBucketView(message) {
    try {
      await new Promise((r) => setTimeout(r, randomInt(100, 300)));
      // await message.clickButton({ X: 1, Y: 1 });
      await clickButton(message, 1, 1);

      const fields = message.embeds[0]?.fields[3]?.value;
      if (!fields) return;

      const [current] = fields
        .match(/(\d+) \/ (\d+)/)
        ?.slice(1)
        ?.map(Number);

      await new Promise((r) => setTimeout(r, randomInt(100, 300)));

      if (current > 0) {
        await CommandManager.addCommand("fish buckets");
      } else {
        // await message.clickButton({ X: 2, Y: 0 });
        await clickButton(message, 2, 0);
      }
    } catch (error) {
      console.error("[ERROR] Bucket view handling failed:", error);
    }
  }

  // Handle fishing cooldown
  async function handleFishingCooldown(message) {
    if (State.isPredicting) return;

    try {
      const timestamp = (message?.embeds[0]?.description?.match(
        /<t:(\d+):R>/
      ) || [])[1];
      let diff = timestamp * 1000 - Date.now() + randomInt(400, 800);
      if (!diff || diff < 0) diff = 0;

      State.isPredicting = true;
      console.log(
        `[INFO] Fishing in ${diff}ms (Bucket: ${State.bucketSpace}/${State.maxBucketSpace})`
      );

      await new Promise((r) => setTimeout(r, diff));

      if (State.bucketSpace < CONFIG.BUCKET_LIMIT) {
        // await message.clickButton({ X: 1, Y: 0 });
        await clickButton(message, 1, 0);
      } else {
        await CommandManager.addCommand("fish buckets");
      }
    } catch (error) {
      console.error("[ERROR] Fishing cooldown handling failed:", error);
    } finally {
      State.isPredicting = false;
    }
  }

  // Handle fish selling
  async function handleFishSelling(message) {
    if (State.isSelling) return;

    try {
      if (!CONFIG.IS_FISHING_ENABLED) return;
      State.isSelling = true;
      // await message.clickButton({ X: 1, Y: 0 });
      await clickButton(message, 1, 0);
      console.log("[INFO] Selling fish");
      await CommandManager.addCommand("fish catch");
    } catch (error) {
      console.error("[ERROR] Fish selling failed:", error);
    } finally {
      State.isSelling = false;
    }
  }
  // Event handlers
  client.on("interactionModalCreate", (modal) => {
    if (modal.title == "Dank Memer Shop") {
      modal.components[0].components[0].setValue(`${State.latestBuyQuantity}`);
      modal.reply();
      console.log(
        chalk.cyan(
          `${client.user.username}: Successfully bought an item (shovel/rifle)`
        )
      );
    }
  });

  client.on("ready", async () => {
    console.log(`[STARTUP] ${client.user.username} is ready!`);
    if (CONFIG.AUTOBUY.length > 0 || CONFIG.AUTOUSE.length > 0) {
      CommandManager.addCommand("inventory");
    }
    CONFIG.AUTOUSE.forEach(({ name, time }) => {
      CommandManager.addCommand("use", [name]);
      setInterval(() => {
        CommandManager.addCommand("use", [name]);
      }, time);
    });
    if (CONFIG.IS_STREAMING_ENABLED) {
      CommandManager.addCommand("stream");
    }
    if (CONFIG.IS_ADVENTURE_ENABLED) {
      CommandManager.addCommand("adventure");
    }
    try {
      CommandManager.channel = CONFIG.PLAY_IN_DMS
        ? await (await client.users.fetch(CONFIG.BOT_ID)).createDM()
        : await client.channels.fetch(CONFIG.CHANNEL_ID);
      initializeBot();
      if (!CONFIG.IS_FISHING_ENABLED) return;
      CommandManager.addCommand("fish catch");

      // check if the bot is able to fish
      // auto unstuck the bot if it is stuck
      setInterval(async () => {
        if (
          State.isBotAbleToFish &&
          Date.now() - State.lastFishTimestamp > 60000
        ) {
          CommandManager.addCommand("fish catch");
        }
      }, 60000);
    } catch (error) {
      console.error("[STARTUP ERROR]", error);
    }
  });

  client.on("messageUpdate", async (_, newMessage) => {
    const message = newMessage;
    if (
      message.author.id !== CONFIG.BOT_ID ||
      message?.interaction?.user !== client?.user
    )
      return;

    if (CONFIG.DEV_MODE && message?.embeds) {
      console.log("[DEBUG] Embeds:", message.embeds);
    }

    await handleMessageUpdate(message);
  });

  client.on("messageCreate", async (message) => {
    if (message?.flags?.has("EPHEMERAL")) {
      if (message.embeds[0]?.title?.includes("Captcha")) {
        State.isBotBusy = true;
        const { browser, page } = await connect({
          headless: "new",

          args: [],

          customConfig: {},

          turnstile: true,

          connectOption: {},

          disableXvfb: false,
          ignoreAllFlags: false,
          // proxy:{
          //     host:'<proxy-host>',
          //     port:'<proxy-port>',
          //     username:'<proxy-username>',
          //     password:'<proxy-password>'
          // }
        });

        fetch(
          "https://discord.com/api/v9/oauth2/authorize?client_id=270904126974590976&response_type=code&redirect_uri=https%3A%2F%2Fdankmemer.lol%2Fapi%2Fauth%2Fcallback&scope=identify&state=redirect%3A%2F",
          {
            headers: {
              accept: "*/*",
              "accept-language": "en-US,en;q=0.9",
              authorization: client.token,
              "content-type": "application/json",
              priority: "u=1, i",
              "sec-ch-ua":
                '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
              "sec-ch-ua-mobile": "?1",
              "sec-ch-ua-platform": '"Android"',
              "sec-fetch-dest": "empty",
              "sec-fetch-mode": "cors",
              "sec-fetch-site": "same-origin",
              "x-debug-options": "bugReporterEnabled",
              "x-discord-locale": "ru",
              "x-discord-timezone": "Asia/Calcutta",
              "x-super-properties":
                "eyJvcyI6IkxpbnV4IiwiYnJvd3NlciI6IkNocm9tZSIsImRldmljZSI6IiIsInN5c3RlbV9sb2NhbGUiOiJlbi1VUyIsImhhc19jbGllbnRfbW9kcyI6ZmFsc2UsImJyb3dzZXJfdXNlcl9hZ2VudCI6Ik1vemlsbGEvNS4wIChMaW51eDsgQW5kcm9pZCA2LjA7IE5leHVzIDUgQnVpbGQvTVJBNThOKSBBcHBsZVdlYktpdC81MzcuMzYgKEtIVE1MLCBsaWtlIEdlY2tvKSBDaHJvbWUvMTMxLjAuMC4wIE1vYmlsZSBTYWZhcmkvNTM3LjM2IiwiYnJvd3Nlcl92ZXJzaW9uIjoiMTMxLjAuMC4wIiwib3NfdmVyc2lvbiI6IjYuMCIsInJlZmVycmVyIjoiIiwicmVmZXJyaW5nX2RvbWFpbiI6IiIsInJlZmVycmVyX2N1cnJlbnQiOiJodHRwczovL2RhbmttZW1lci5sb2wvIiwicmVmZXJyaW5nX2RvbWFpbl9jdXJyZW50IjoiZGFua21lbWVyLmxvbCIsInJlbGVhc2VfY2hhbm5lbCI6InN0YWJsZSIsImNsaWVudF9idWlsZF9udW1iZXIiOjM1ODAxMSwiY2xpZW50X2V2ZW50X3NvdXJjZSI6bnVsbH0=",
              cookie:
                "__dcfduid=2ba65270c8de11efa7fbf93da55b3963; __sdcfduid=2ba65271c8de11efa7fbf93da55b3963ad540586ca4461e314f4af020b3552054438dba407fe6d53923b670ab655780a; __stripe_mid=e4d11e89-e86f-454c-8341-203deb5fd23b155b5c; locale=ru; cf_clearance=g4bB5qnbBQeeR9vRc9cYL2kFGaEP11_RYgi9RDzo9kY-1736567229-1.2.1.1-IetqfKfacPeXkhMuAQbRegvxWcIkmJ20yUH1PCJ9Vua1MOgvvu1gDfexfb8AkUVVZKfYGuOqkf0ihy16OZgOSH0p9qPlAL9WMMdQTmzfCPvW1hPmRNrZNJgIwN1A9Vks9IKLqVPkDSad.yeoNIciDtOtEPiotsTT95j9TGXBNxS_Q77g5_Xp0awV0.rVER5RFOa7m3Su72UMb6afHzxP4J8XsW_O9_sQae21t.VnMbkbUGnCEde0Iy6yNHdfy.SJP3TTCNEXuKxEKqv.u.WIYfXuLwu72otZCfDZJArIomY; __cfruid=bda21e5167f72b3502fa7f0a0c9178e995aa60dd-1736567230; _cfuvid=GJnji8y2quoT8P5_1Xrf7s4H1c_gmnPjN16d22zJdTA-1736567230082-0.0.1.1-604800000",
              Referer:
                "https://discord.com/oauth2/authorize?response_type=code&client_id=270904126974590976&redirect_uri=https%3A%2F%2Fdankmemer.lol%2Fapi%2Fauth%2Fcallback&scope=identify&state=redirect%3A%2F",
              "Referrer-Policy": "strict-origin-when-cross-origin",
            },
            body: '{"guild_id":"793599889971740694","permissions":"0","authorize":true,"integration_type":0,"location_context":{"guild_id":"10000","channel_id":"10000","channel_type":10000}}',
            method: "POST",
          }
        )
          .then((response) => response.json())
          .then(async (data) => {
            console.log(data);

            let url = data.location;
            //set view port
            await page.setViewport({ width: 1920, height: 1080 });
            await page.goto(url);
            await page.goto("https://dankmemer.lol/captcha");
            setTimeout(async () => {
              await browser.close();
              State.isBotBusy = false;
            }, 15000);
          })
          .catch((err) => console.error(err));
      }
      //if title includes Tight
      if (message.embeds[0]?.title?.includes("Tight")) {
        let lastClickedButton = State.lastButtonClick;
        let lastClickedTimestamp = State.lastButtonClickTimestamp;
        let lastCommand = State.lastUsedCommand;
        let lastCommandOptions = State.lastUsedCommandOptions;
        let lastCommandTimestamp = State.lastCommandTimestamp;

        //which was last clicked - button or command
        if (lastClickedTimestamp > lastCommandTimestamp) {
          //last clicked button
          await clickButton(lastClickedButton);
        } else {
          //last used command
          await CommandManager.addCommand(lastCommand, lastCommandOptions);
        }
      }
    }
    if (
      message.author.id !== CONFIG.BOT_ID ||
      message?.interaction?.user !== client?.user
    )
      return;

    await handleNewMessage(message);
  });

  // Helper functions
  async function initializeBot() {
    startCommandLoop();
    startRandomCommandScheduler();
  }

  async function startCommandLoop() {
    while (true) {
      try {
        await CommandManager.processQueue();
        await new Promise((r) => setTimeout(r, calculateDelay()));
      } catch (error) {
        console.error("[ERROR] Command loop:", error);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }

  function calculateDelay() {
    let delay = randomInt(CONFIG.DELAYS.MIN_COMMAND, CONFIG.DELAYS.MAX_COMMAND);
    if (Math.random() < 0.1) {
      const [min, max] =
        Math.random() < 0.7
          ? CONFIG.DELAYS.SHORT_BREAK
          : CONFIG.DELAYS.LONG_BREAK;
      delay += randomInt(min, max);
    }
    return delay;
  }

  // Message handlers
  async function handleMessageUpdate(message) {
    // Handle bucket space updates
    if (message?.embeds[1]?.description?.includes("Bucket Space")) {
      updateBucketSpace(message);
    }

    //handle shop
    if (message?.embeds[0]?.title?.includes("Dank Memer Shop")) {
      handleShop(message);
    }

    // Handle fishing cooldown
    if (
      message?.embeds[0]?.description?.includes("You can fish again") ||
      message?.embeds[0]?.title?.includes("There was nothing")
    ) {
      if (!CONFIG.IS_FISHING_ENABLED) return;
      State.lastFishTimestamp = Date.now();
      await handleFishingCooldown(message);
    }

    //handle adventure
    if (
      message?.embeds[0]?.title?.includes(
        "choose items you want to bring along"
      )
    ) {
      State.isBotBusy = true;
      // await message.clickButton({ X: 0, Y: 1 });
      await clickButton(message, 0, 1);
      State.isBotBusy = false;
    }

    // handle adventure
    if (message.interaction.commandName.includes("adventure")) {
      handleAdventure(message);
    }

    // Handle fishing minigame
    if (message?.embeds[0]?.title?.includes("Fishing...")) {
      if (!CONFIG.IS_FISHING_ENABLED) return;
      await FishingGame.handleMinigame(message, message?.embeds[0]?.image?.url);
    }

    // Handle inventory new pages

    // scrape inventory
    if (
      message?.embeds[0]?.author?.name?.includes(
        `${client.user.username}'s inventory`
      )
    ) {
      handleInventory(message);
    }

    // handle stream
    if (message?.embeds[0]?.author?.name?.includes("Stream Manager")) {
      if (
        message?.embeds[0]?.description?.includes(
          "What game do you want to stream"
        )
      ) {
        if (State.streamingFlag) return;
        const trendingGame = await fetch(
          `https://api.dankmemer.tools/trending`
        ).then((res) => res.text());
        const streamMenu = message.components[0].components[0];
        let streamGame = trendingGame.toLowerCase().replace(/ /g, "");
        // use random menu item if streamGame is not found
        if (!streamMenu.options.find((option) => option.value === streamGame)) {
          streamGame =
            streamMenu.options[
              Math.floor(Math.random() * streamMenu.options.length)
            ].value;
        }
        console.log(`[INFO] Streaming ${streamGame}`);
        State.streamingFlag = true;
        State.isBotBusy = true;
        await message.selectMenu(streamMenu, [streamGame]);
        // await message.clickButton({ X: 0, Y: 1 });
        await clickButton(message, 0, 1);

        State.streamingFlag = false;
        State.isBotBusy = false;

        setTimeout(() => {
          // message.clickButton({ X: randomInt(0, 2), Y: 0 });
          clickButton(message, randomInt(0, 2), 0);
          State.lastStreamTimestamp = Date.now();
        }, 1000 * randomInt(15, 30));

        let interval = setInterval(() => {
          if (State.lastStreamTimestamp - Date.now() > 1000 * 60 * 12) {
            if (!State.isStreamStillRunning) {
              clearInterval(interval);
            }
            // message.clickButton({ X: randomInt(0, 2), Y: 0 });
            clickButton(message, randomInt(0, 2), 0);
            State.lastStreamTimestamp = Date.now();
          }
        }, 20000);
      }
    }
    // Handle Dead Memes
    if (
      message?.embeds[0]?.author?.name?.includes("Meme Posting Session") &&
      message?.embeds[0]?.description?.includes("dead meme")
    ) {
      CommandManager.cooldowns["postmemes"] =
        Date.now() + 180000 + randomInt(1000, 2000); // retry in 3 minutes + random delay
    }

    // Handle fish selling
    if (
      message?.embeds[0]?.description?.includes(
        "Are you sure you want to sell?"
      )
    ) {
      await handleFishSelling(message);
    }
  }
  async function handleAdventure(message) {
    let description = message.embeds[0].description;

    if (message?.embeds[0]?.author?.name.includes("Adventure Summary")) {
      //get label of button
      let buttonLabel = message.components[0].components[0].label;
      //Adventure again in 22 minute
      if (buttonLabel.includes("dventure again in")) {
        let time = buttonLabel.match(/\d+/);
        setTimeout(() => {
          CommandManager.addCommand("adventure");
        }, time * 60000 + randomInt(10000, 20000));
      }
    }
    if (!description) return;

    // console.log(`[INFO] Adventure: ${description}`);
    if (description?.includes("You can start another adventure at ")) return;

    if (description?.includes("Catch one of em")) {
      // await message.clickButton({ X: randomInt(0, 2), Y: 0 });
      // await message.clickButton({ X: 1, Y: 1 });
      try {
        await clickButton(message, randomInt(0, 2), 0);
        await clickButton(message, 1, 1);
      } catch (e) {
        await clickButton(message, 1, 1);

        console.log(e);
      }
      return;
    }

    if (!message.components[1]) {
      // return message.clickButton({ X: 1, Y: 0 });
      return clickButton(message, 1, 0);
    }

    //check description from CONFIG.ADVENTURE_WEST
    let action = Object.keys(CONFIG.ADVENTURE_WEST).find((key) =>
      description.includes(key)
    );
    action = CONFIG.ADVENTURE_WEST[action];
    console.log(`[INFO] Adventure: ${description} => ${action}`);
    if (action) {
      // find the button with the label equal to the action
      let buttonIndex = message.components[0].components.findIndex((btn) => {
        return btn.label
          .toLowerCase()
          .trim()
          .includes(action.toLowerCase().trim());
      });

      console.log(`[INFO] Button index: ${buttonIndex}`);
      // await message.clickButton({ X: buttonIndex, Y: 0 });
      // await message.clickButton({ X: 1, Y: 1 });
      try {
        await clickButton(message, buttonIndex, 0);
        await clickButton(message, 1, 1);
      } catch (e) {
        await clickButton(message, 1, 1);

        console.log(e);
      }
    }
  }
  async function handleInventory(message) {
    State.isBotBusy = true;
    message.embeds[0].description.split("\n\n").forEach((item) => {
      const [name, quantity] = item.split(" ─ ").map((str) => str.trim());
      const itemName = name
        .replace(/^\*\*<:[^>]+>\s*|\*\*/g, "")
        .toLowerCase()
        ?.split(">")
        .pop()
        .trim();
      const existingItem = State.inventory.find((i) => i.name === itemName);
      if (existingItem) {
        existingItem.quantity = parseInt(quantity);
      } else {
        State.inventory.push({ name: itemName, quantity: parseInt(quantity) });
      }
    });

    // console.log(State.inventory);
    // remove items from State.inventory that are not in the inventory message
    // State.inventory = State.inventory.filter((item) =>
    //   message.embeds[0].description.includes(item.name)
    // );
    // console.log(State.inventory);

    const [_, page, total] = message.embeds[0].footer.text
      .match(/Page (\d+) of (\d+)/)
      .map(Number);
    console.log(`[INFO] Inventory page ${page} of ${total}`);
    if (page < total) {
      // message.clickButton({ X: 2, Y: 1 });
      clickButton(message, 2, 1);
    } else {
      State.isBotBusy = false;

      // auto buy
      CONFIG.AUTOBUY.forEach(({ item, quantity }) => {
        // console.log(State.inventory);
        const existingItem = State.inventory.find((i) =>
          i.name.toLowerCase()?.includes(item.toLowerCase())
        );
        const buyQuantity = quantity - (existingItem?.quantity || 0);
        if (buyQuantity > 0) {
          State.thingsToBuy.push({ name: item, quantity: buyQuantity });
          console.log(`[INFO] Adding ${buyQuantity} ${item}`);
        }
      });
      if (State.thingsToBuy.length > 0) {
        CommandManager.addCommand("shop view");
      }
    }
  }

  async function handleShop(message) {
    let components = message.components[1].components;
    let components2 = message.components[2].components;
    // console.log(components);
    // [
    //   MessageButton {
    //     type: 'BUTTON',
    //     label: 'Buy Shovel',
    //     customId: 'shop-buy:1235952897460535310:coin:0:0',
    //     style: 'PRIMARY',
    //     emoji: { id: '868263822035669002', name: 'IronShovel', animated: false },
    //     url: null,
    //     disabled: false
    //   },
    //   MessageButton {
    //     type: 'BUTTON',
    //     label: 'Buy Rifle',
    //     customId: 'shop-buy:1235952897460535310:coin:0:1',
    //     style: 'PRIMARY',
    //     emoji: { id: '868286178070261760', name: 'LowRifle', animated: false },
    //     url: null,
    //     disabled: false
    //   },
    //   MessageButton {
    //     type: 'BUTTON',
    //     label: 'Buy Mouse',
    //     customId: 'shop-buy:1235952897460535310:coin:0:2',
    //     style: 'PRIMARY',
    //     emoji: { id: '904821818425241600', name: 'Mouse', animated: false },
    //     url: null,
    //     disabled: false
    //   }
    // ]

    //check if the item is either in components or components2
    // if present, buy. if not present, click button with x =1,y=3

    State.thingsToBuy.forEach((item) => {
      const index = components.findIndex((comp) =>
        comp.label
          .toLowerCase()
          .replace(/ /g, "")
          .includes(item.name.toLowerCase().replace(/ /g, ""))
      );
      const index2 = components2.findIndex((comp) =>
        comp.label
          .toLowerCase()
          .replace(/ /g, "")
          .includes(item.name.toLowerCase().replace(/ /g, ""))
      );

      if (index > -1) {
        State.latestBuyQuantity = item.quantity;
        // message.clickButton({ X: index, Y: 1 });
        clickButton(message, index, 1);
      } else if (index2 > -1) {
        State.latestBuyQuantity = item.quantity;
        // message.clickButton({ X: index2, Y: 2 });
        clickButton(message, index2, 2);
      } else {
        const [_, currentPage, totalPages] = message.embeds[0].footer.text
          .match(/Page (\d+) of (\d+)/)
          .map(Number);
        if (currentPage < totalPages) {
          console.log(`Page ${currentPage} of ${totalPages}`);
          // message.clickButton({ X: 1, Y: 3 });
          clickButton(message, 1, 3);
        }
      }
    });
  }
  async function handleNewMessage(message) {
    // Handle high-low game
    if (
      message?.embeds[0]?.description?.includes("I just chose a secret number")
    ) {
      await handleHighLowGame(message);
    }

    // Debug mode
    if (CONFIG.DEV_MODE && message?.embeds) {
      console.log("[DEBUG] Embeds:", message.embeds);
      if (message?.components) {
        console.log("[DEBUG] Attachments:", message.components);
        // console.log("[DEBUG] Components:", message.components[0]?.components);
      }
    }

    // auto stream
    if (message?.embeds[0]?.author?.name?.includes("Stream Manager")) {
      if (
        message.embeds[0]?.fields[1]?.value &&
        message.components[0].components[2]
      ) {
        // await message.clickButton({ X: randomInt(0, 2), Y: 0 });
        await clickButton(message, randomInt(0, 2), 0);
        State.lastStreamTimestamp = Date.now();

        const interval = setInterval(async () => {
          if (Date.now() - State.lastStreamTimestamp > 1000 * 60 * 12) {
            if (!State.isStreamStillRunning) clearInterval(interval);
            // await message.clickButton({ X: randomInt(0, 2), Y: 0 });
            await clickButton(message, randomInt(0, 2), 0);
            State.lastStreamTimestamp = Date.now();
            console.log("[INFO] Stream is still running");
          }
        }, 20000);
      } else {
        // await message.clickButton({ X: 0, Y: 0 });
        await clickButton(message, 0, 0);
      }
    }

    //handle adventure
    if (message.interaction.commandName.includes("adventure")) {
      handleAdventure(message);
    }

    if (
      message.embeds[0]?.description?.includes(
        "You can start another adventure"
      )
    ) {
      //You can start another adventure at <t:1736519912:t>
      const time =
        message.embeds[0].description.match(/<t:(\d+):t>/)[1] * 1000 -
        Date.now() +
        randomInt(1000, 2000);
      setTimeout(() => CommandManager.addCommand("adventure"), time);
    }
    // adventure
    if (message?.embeds[0]?.author?.name?.includes("Choose an Adventure")) {
      await message.selectMenu(message.components[0].components[0], ["west"]);
      if (!message?.components[1]?.components[0]?.disabled) {
        // await message.clickButton({ X: 0, Y: 1 });
        await clickButton(message, 0, 1);
      }
    }

    // auto buy from shop
    if (message?.embeds[0]?.title?.includes("Dank Memer Shop")) {
      handleShop(message);
    }

    // scrape inventory
    if (
      message?.embeds[0]?.author?.name?.includes(
        `${client.user.username}'s inventory`
      )
    ) {
      handleInventory(message);
    }

    // post memes
    if (message?.embeds[0]?.author?.name?.includes("Meme Posting Session")) {
      State.isBotBusy = true;
      try {
        const selectRandomOption = (menu) =>
          menu.options[Math.floor(Math.random() * menu.options.length)].value;

        const [PlatformMenu, MemeTypeMenu] = message.components.map(
          (comp) => comp.components[0]
        );

        const Platform = CONFIG.POST_MEMES_PLATFORMS.includes("RANDOM")
          ? selectRandomOption(PlatformMenu)
          : CONFIG.POST_MEMES_PLATFORMS[
              Math.floor(Math.random() * CONFIG.POST_MEMES_PLATFORMS.length)
            ];

        message.selectMenu(PlatformMenu, [Platform]);
        message.selectMenu(MemeTypeMenu, [selectRandomOption(MemeTypeMenu)]);
        // message.clickButton({ X: 0, Y: 2 });
        clickButton(message, 0, 2);
      } catch (e) {
        Logger.error(`Failed to post meme: ${e.message}`);
      } finally {
        State.isBotBusy = false;
      }
    }
    if (message?.embeds[0]?.description?.includes("What crime")) {
      clickButton(message, randomInt(0, 2), 0);
    }

    // Handle search locations

    if (message?.embeds[0]?.description?.includes("do you want to search")) {
      const labels = message.components[0]?.components.map((btn) =>
        btn.label.toLowerCase()
      );
      const location = CONFIG.SEARCH_LOCATIONS.find((loc) =>
        labels.includes(loc.toLowerCase())
      );
      // if no location is found, select a random location
      const index = location
        ? labels.indexOf(location.toLowerCase())
        : randomInt(0, labels.length - 1);
      // message.clickButton({ X: index, Y: 0 });
      clickButton(message, index, 0);
    }
    // Handle bucket management
    if (message?.embeds[0]?.title?.includes("Viewing Bucket Slots")) {
      if (!CONFIG.IS_FISHING_ENABLED) return;
      await handleBucketView(message);
    }
    if (message?.embeds[0]?.fields[3]?.value) {
      const fields = message.embeds[0]?.fields[3]?.value;
      if (!fields) return;
      if (!CONFIG.IS_FISHING_ENABLED) return;

      const match = fields.match(/(\d+) \/ (\d+)/);
      if (!match) return;

      const current = parseInt(match[1], 10);
      await new Promise((r) => setTimeout(r, randomInt(100, 300)));

      // Handle bucket actions based on capacity
      if (current > 5) {
        CommandManager.addCommand("fish buckets");
      } else {
        // message.clickButton({ X: 2, Y: 0 });
        clickButton(message, 2, 0);
      }
    }
  }

  // Secure login using environment variable
  client.login(token);

  async function clickButton(message, x, y) {
    await message.clickButton({ X: x, Y: y });
    let button = message.components[y].components[x];
    State.lastButtonClick = button;
    State.lastButtonClickTimestamp = Date.now();
  }
}

// Extra global functions
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
