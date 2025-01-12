import chalk from "chalk";

export const Logger = {
    info: (msg) => console.log(chalk.blue(`[INFO]: ${msg}`)),
    success: (msg) => console.log(chalk.green(`[SUCCESS]: ${msg}`)),
    warning: (msg) => console.log(chalk.yellow(`[WARNING]: ${msg}`)),
    error: (msg) => console.log(chalk.red(`[ERROR]: ${msg}`)),
    game: (msg) => console.log(chalk.magenta(`[GAME]: ${msg}`)),
    fish: (msg) => console.log(chalk.cyan(`[FISH]: ${msg}`)),
    money: (msg) => console.log(chalk.green(`[MONEY]: ${msg}`)),
};