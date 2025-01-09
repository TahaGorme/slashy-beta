// Import required modules
const { Client } = require("discord.js-selfbot-v13");
const chalk = require("chalk");
const fs = require("fs");

// Configuration object
const CONFIG = {
  BOT_ID: "270904126974590976", // Discord bot ID to interact with
  PLAY_IN_DMS: false, // Play in DMs instead of server
  CHANNEL_ID: "796729044468367370", // Channel ID for interaction (leave empty if PLAY_IN_DMS is true)
  DEV_MODE: false, // Debug mode flag (set to true for additional logging)
  WEBSITE_USERNAME: "slashy", // Website username
  WEBSITE_PASSWORD: "slashy", // Website
  API_ENDPOINT: "http://localhost:5000/predict", // API endpoint for image prediction
  POST_MEMES_PLATFORMS: ["reddit", "tiktok"], // Platform to post memes or RANDOM
  IS_FISHING_ENABLED: true, // Enable fishing minigame
  IS_STREAMING_ENABLED: true, // Enable streaming minigame
  AUTOUSE: [
    {
      name: "Lucky Horseshoe",
      time: 1000 * 60 * 15.5,
    },
  ],
  AUTOBUY: [
    {
      item: "Saver",
      quantity: 2,
    },
    {
      item: "Rifle",
      quantity: 10,
    },
  ],
  DELAYS: {
    MIN_COMMAND: 1000, // Minimum delay between commands
    MAX_COMMAND: 2000, // Maximum delay between commands
    SHORT_BREAK: [3000, 6000], // Short break duration
    LONG_BREAK: [30000, 60000], // Long break duration
  },
  COOLDOWNS: {
    highlow: 2500,
    beg: 11000,
    crime: 30000,
    hunt: 30000,
    postmemes: 2300,
    search: 2300,
    hunt: 11000,
  },
  SEARCH_LOCATIONS: [
    "Basement",
    "Bus",
    "Car",
    "Coat",
    "Computer",
    "Dresser",
    "Fridge",
    "Grass",
    "Laundromat",
    "Mailbox",
    "Pantry",
    "Pocket",
    "Shoe",
    "Sink",
    "Supreme Court",
    "Twitter",
    "Vacuum",
    "Washer",
  ],
};

//commands which will prevent the bot from executing other commands
let BLOCKING_COMMANDS = ["postmemes"];

// Global error handlers
process.on("unhandledRejection", (error) => {
  Logger.error(`Something went wrong with a promise: ${error.stack}`);
});

process.on("uncaughtException", (error) => {
  Logger.error(`An unexpected error occurred: ${error.stack}`);
});

const express = require("express");
const app = express();
const auth = require("http-auth");
const basic = auth.basic(
  { realm: "Monitor Area" },
  function (user, pass, callback) {
    callback(
      user === CONFIG.WEBSITE_USERNAME && pass === CONFIG.WEBSITE_PASSWORD
    );
  }
);

// Set '' to config path to avoid middleware serving the html page (path must be a string not equal to the wanted route)
const statusMonitor = require("express-status-monitor")({ path: "" });
app.use(statusMonitor.middleware); // use the "middleware only" property to manage websockets
app.get("/status", basic.check(statusMonitor.pageRoute)); // use the pageRoute property to serve the dashboard html page

app.listen(3000, () => {
  console.log("Server listening on port 3000");
});

// Create a user-friendly logging system
const Logger = {
  info: (msg) => console.log(chalk.blue(`[INFO]: ${msg}`)),
  success: (msg) => console.log(chalk.green(`[SUCCESS]: ${msg}`)),
  warning: (msg) => console.log(chalk.yellow(`[WARNING]: ${msg}`)),
  error: (msg) => console.log(chalk.red(`[ERROR]: ${msg}`)),
  game: (msg) => console.log(chalk.magenta(`[GAME]: ${msg}`)),
  fish: (msg) => console.log(chalk.cyan(`[FISH]: ${msg}`)),
  money: (msg) => console.log(chalk.green(`[MONEY]: ${msg}`)),
};
// List of available commands to automatically queue
let AVAILABLE_COMMANDS = ["highlow", "beg", "postmemes", "search", "hunt"];
// if (CONFIG.IS_FISHING_ENABLED) {
//   //remove postmemes from the list of available commands if fishing is enabled
//   AVAILABLE_COMMANDS = AVAILABLE_COMMANDS.filter((cmd) => cmd !== "postmemes");
// }
const TOKENS = fs.readFileSync("tokens.txt", "utf-8").split("\n");

// Start the bot
TOKENS.map((token) => slashy(token.trim().replace(/\r/g, "")));

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

        this.cooldowns[command.name] =
          Date.now() + (CONFIG.COOLDOWNS[command.name] || 2500);
      } catch (error) {
        Logger.error(`Failed to execute command: ${error.message}`);
      } finally {
        State.isBotBusy = false;
      }
    },
  };

  // Fishing game handler
  const FishingGame = {
    // Moves for each square
    moves: {
      1: [0, 1, 1, 2],
      2: [1, 1, 2],
      3: [4, 1, 1, 2],
      4: [0, 1, 2],
      5: [1, 2],
      6: [4, 1, 2],
      7: [0, 2],
      9: [4, 2],
    },

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
      const response = await fetch(CONFIG.API_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: image }),
      });
      return response.json();
    },

    async executeMoves(message, { success, square }) {
      const moves = this.moves[square];
      if (success && moves) {
        for (const move of moves) {
          // await new Promise((r) => setTimeout(r, randomInt(100, 300)));
          await message.clickButton({ X: move, Y: 0 });
          if (move === moves[moves.length - 1]) {
            State.isBotBusy = false;
          }
        }
      } else {
        await this.executeFailsafe(message);
        State.isBotBusy = false;
      }
    },

    async executeFailsafe(message) {
      await message.clickButton({ X: 4, Y: 0 });
      await new Promise((r) => setTimeout(r, randomInt(100, 300)));
      await message.clickButton({ X: 2, Y: 0 });
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
      await message.clickButton({ X: secretNumber > 50 ? 0 : 2, Y: 0 });
    } catch (error) {
      console.error("[ERROR] High-low game failed:", error);
    }
  }

  // Handle bucket viewing and management
  async function handleBucketView(message) {
    try {
      await new Promise((r) => setTimeout(r, randomInt(100, 300)));
      await message.clickButton({ X: 1, Y: 1 });

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
        await message.clickButton({ X: 2, Y: 0 });
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

      if (State.bucketSpace < State.maxBucketSpace) {
        await message.clickButton({ X: 1, Y: 0 });
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
      await message.clickButton({ X: 1, Y: 0 });
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

    CommandManager.addCommand("inventory");
    // auto use
    CONFIG.AUTOUSE.forEach(({ name, time }) => {
      CommandManager.addCommand("use", [name]);
      setInterval(() => {
        CommandManager.addCommand("use", [name]);
      }, time);
    });
    if (CONFIG.IS_STREAMING_ENABLED) {
      CommandManager.addCommand("stream");
    }
    try {
      if (!CONFIG.IS_FISHING_ENABLED) return;
      CommandManager.channel = CONFIG.PLAY_IN_DMS
        ? await (await client.users.fetch(CONFIG.BOT_ID)).createDM()
        : await client.channels.fetch(CONFIG.CHANNEL_ID);
      CommandManager.addCommand("fish catch");
      initializeBot();

      // check if the bot is able to fish
      // auto unstuck the bot if it is stuck
      setInterval(() => {
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
    if (
      message.author.id !== CONFIG.BOT_ID ||
      message?.interaction?.user !== client?.user
    )
      return;

    await handleNewMessage(message);
  });

  // Helper functions
  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

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
    if (message?.embeds[0]?.description?.includes("You can fish again")) {
      if (!CONFIG.IS_FISHING_ENABLED) return;
      State.lastFishTimestamp = Date.now();
      await handleFishingCooldown(message);
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
        if (State.isBotBusy) return;
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
        State.isBotBusy = true;
        await message.selectMenu(streamMenu, [streamGame]);
        message.clickButton({ X: 0, Y: 1 });

        State.isBotBusy = false;
        setTimeout(() => {
          message.clickButton({ X: randomInt(0, 2), Y: 0 });
          State.lastStreamTimestamp = Date.now();
        }, 1000 * randomInt(15, 30));

        let interval = setInterval(() => {
          if (State.lastStreamTimestamp - Date.now() > 1000 * 60 * 12) {
            if (!State.isStreamStillRunning) {
              clearInterval(interval);
            }
            message.clickButton({ X: randomInt(0, 2), Y: 0 });
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
      message.clickButton({ X: 2, Y: 1 });
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
        message.clickButton({ X: index, Y: 1 });
      } else if (index2 > -1) {
        State.latestBuyQuantity = item.quantity;
        message.clickButton({ X: index2, Y: 2 });
      } else {
        const [_, currentPage, totalPages] = message.embeds[0].footer.text
          .match(/Page (\d+) of (\d+)/)
          .map(Number);
        if (currentPage < totalPages) {
          console.log(`Page ${currentPage} of ${totalPages}`);
          message.clickButton({ X: 1, Y: 3 });
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
        await message.clickButton({ X: randomInt(0, 2), Y: 0 });
        State.lastStreamTimestamp = Date.now();

        const interval = setInterval(() => {
          if (Date.now() - State.lastStreamTimestamp > 1000 * 60 * 12) {
            if (!State.isStreamStillRunning) clearInterval(interval);
            message.clickButton({ X: randomInt(0, 2), Y: 0 });
            State.lastStreamTimestamp = Date.now();
          }
        }, 20000);
      } else {
        await message.clickButton({ X: 0, Y: 0 });
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
        message.clickButton({ X: 0, Y: 2 });
      } catch (e) {
        Logger.error(`Failed to post meme: ${e.message}`);
      } finally {
        State.isBotBusy = false;
      }
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
      message.clickButton({ X: index, Y: 0 });
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
      if (current > 0) {
        CommandManager.addCommand("fish buckets");
      } else {
        message.clickButton({ X: 2, Y: 0 });
      }
    }
  }

  // Secure login using environment variable
  client.login(token);
}
