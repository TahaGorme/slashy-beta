const CONFIG = {
    BOT_ID: "270904126974590976", // Discord bot ID to interact with
    PLAY_IN_DMS: false, // Play in DMs instead of server
    CHANNEL_ID: "796729044468367370", // Channel ID for interaction (leave empty if PLAY_IN_DMS is true)
    DEV_MODE: false, // Debug mode flag (set to true for additional logging)
    WEBSITE_USERNAME: "slashy", // Website username
    WEBSITE_PASSWORD: "slashy", // Website
    API_ENDPOINT: "http://localhost:6000/predict", // API endpoint for image prediction
    POST_MEMES_PLATFORMS: ["reddit", "tiktok"], // Platform to post memes or RANDOM
    IS_FISHING_ENABLED: false, // Enable fishing minigame
    IS_STREAMING_ENABLED: true, // Enable streaming minigame
    IS_ADVENTURE_ENABLED: true, // Enable adventure minigame
    BUCKET_LIMIT: 0, // Maximum bucket space,
    LOGIN_DELAY_MIN: 4000, // Minimum delay between logins
    LOGIN_DELAY_MAX: 8000, // Maximum delay between logins
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
        MIN_COMMAND: 100, // Minimum delay between commands
        MAX_COMMAND: 200, // Maximum delay between commands
        SHORT_BREAK: [3000, 6000], // Short break duration
        LONG_BREAK: [30000, 60000], // Long break duration
    },
    COOLDOWNS: {
        highlow: 2000,
        beg: 10000,
        crime: 10000,
        postmemes: 2000,
        search: 2000,
        hunt: 10000,
        dig: 10000,
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
    ADVENTURE_WEST: {
        "A lady next to a broken down wagon is yelling for help.": "Ignore Her",
        "A snake is blocking your path. What do you want to do?": "Wait",
        "A stranger challenges you to a quick draw. What do you want to do?":
            "Decline",
        "Someone is getting ambushed by bandits!": "Ignore them",
        "Someone on the trail is lost and asks you for directions.": "Ignore them",
        "You bump into someone near the horse stables. They challenge you to a duel":
            "Run away",
        "You come across a saloon with a poker game going on inside. What do you want to do?":
            "Join",
        "You entered the saloon to rest from the journey. What do you want to do?":
            "Play the piano",
        "You find a dank cellar with an old wooden box": "Ignore it",
        "You find an abandoned mine. What do you want to do?": "Explore",
        "You found a stray horse. What do you want to do?": "Feed",
        "You get on a train and some bandits decide to rob the train. What do you do?":
            "Don't hurt me!",
        "You see some bandits about to rob the local towns bank. What do you do?":
            "Stop them",
        "You wander towards an old abandoned mine.": "Go in",
        "You're dying of thirst. Where do you want to get water?": "Cactus",
        "You're riding on your horse and you get ambushed. What do you do?":
            "Run away",
        "Your horse sees a snake and throws you off. What do you do?":
            "Find a new horse",
        "__**WANTED:**__": "Billy Bob Jr.",
    },
};

export default CONFIG;