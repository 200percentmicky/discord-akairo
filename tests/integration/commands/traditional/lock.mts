import { type Message } from "discord.js";
import { promisify } from "node:util";
import { Command } from "../../../../src/index.js";

const sleep = promisify(setTimeout);

export default class LockCommand extends Command {
	public constructor() {
		super("lock", {
			aliases: ["lock"],
			lock: "guild"
		});
	}

	public override exec(message: Message) {
		return [0, 1, 2, 3, 4].reduce(
			(promise, num) =>
				promise
					.then(() => sleep(1000))
					.then(() => {
						message.util!.send(`${num}`);
					}),
			Promise.resolve()
		);
	}
}
