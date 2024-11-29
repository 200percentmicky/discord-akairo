import {
	ChannelType,
	Collection,
	type AnyThreadChannel,
	type DMChannel,
	type DirectoryChannel,
	type GuildBasedChannel,
	type GuildMember,
	type GuildTextBasedChannel,
	type Message,
	type Snowflake,
	type VoiceBasedChannel
} from "discord.js";
import { URL } from "node:url";
import { SyncOrAsync } from "../../../typings/Util.js";
import { ArgumentTypes } from "../../../util/Constants.js";
import type { AkairoClient } from "../../AkairoClient.js";
import type { ContextMenuCommandHandler } from "../../contextMenuCommands/ContextMenuCommandHandler.js";
import type { InhibitorHandler } from "../../inhibitors/InhibitorHandler.js";
import type { ListenerHandler } from "../../listeners/ListenerHandler.js";
import type { TaskHandler } from "../../tasks/TaskHandler.js";
import type { CommandHandler } from "../CommandHandler.js";
import type { ArgumentTypeCaster, BaseArgumentType } from "./Argument.js";

/**
 * Type resolver for command arguments.
 * The types are documented under ArgumentType.
 */
export class TypeResolver {
	/**
	 * The Akairo client.
	 */
	public client: AkairoClient;

	/**
	 * The command handler.
	 */
	public commandHandler: CommandHandler;

	/**
	 * The inhibitor handler.
	 */
	public inhibitorHandler?: InhibitorHandler | null;

	/**
	 * The listener handler.
	 */
	public listenerHandler?: ListenerHandler | null;

	/**
	 * The task handler.
	 */
	public taskHandler: TaskHandler | null;

	/**
	 * The context menu command handler.
	 */
	public contextMenuCommandHandler: ContextMenuCommandHandler | null;

	/**
	 * Collection of types.
	 */
	public types: Collection<keyof BaseArgumentType | string, ArgumentTypeCaster>;

	/**
	 * @param handler - The command handler.
	 */
	public constructor(handler: CommandHandler) {
		this.client = handler.client;
		this.commandHandler = handler;
		this.inhibitorHandler = null;
		this.listenerHandler = null;
		this.taskHandler = null;
		this.contextMenuCommandHandler = null;
		this.types = new Collection();
		this.addBuiltInTypes();
	}

	private isChannelTypeOf<T extends ChannelType>(type: T) {
		return (channel: any | null): channel is { type: T } & GuildBasedChannel => channel?.type === type;
	}

	private singleChannelBuiltInType<C extends GuildBasedChannel>(predicate: (channel: GuildBasedChannel | null) => channel is C) {
		return (message: Message, phrase: string): C | null => {
			if (!phrase || !message.inGuild()) return null;
			const channel = this.client.util.resolveChannel(phrase, message.guild.channels.cache);
			if (!predicate(channel)) return null;

			return <C>channel;
		};
	}

	private multipleChannelBuiltInType<C extends GuildBasedChannel>(predicate: (channel: GuildBasedChannel) => channel is C) {
		return (message: Message, phrase: string): Collection<Snowflake, C> | null => {
			if (!phrase || !message.inGuild()) return null;
			const channels = this.client.util.resolveChannels(phrase, message.guild.channels.cache);
			if (!channels.size) return null;

			const filteredChannels = <Collection<Snowflake, C>>channels.filter(c => predicate(c));
			return filteredChannels.size ? filteredChannels : null;
		};
	}

	/**
	 * Adds built-in types.
	 */
	public addBuiltInTypes(): void {
		const builtIns: {
			[K in keyof BaseArgumentType]: (message: Message, phrase: string) => SyncOrAsync<BaseArgumentType[K]>;
		} = {
			[ArgumentTypes.STRING]: (_message, phrase) => {
				return phrase || null;
			},

			[ArgumentTypes.LOWERCASE]: (_message, phrase) => {
				return phrase ? phrase.toLowerCase() : null;
			},

			[ArgumentTypes.UPPERCASE]: (_message, phrase) => {
				return phrase ? phrase.toUpperCase() : null;
			},

			[ArgumentTypes.CHAR_CODES]: (_message, phrase) => {
				if (!phrase) return null;
				const codes = [];
				for (const char of phrase) codes.push(char.charCodeAt(0));
				return codes;
			},

			[ArgumentTypes.NUMBER]: (_message, phrase) => {
				if (!phrase || isNaN(+phrase)) return null;
				return parseFloat(phrase);
			},

			[ArgumentTypes.INTEGER]: (_message, phrase) => {
				if (!phrase || isNaN(+phrase)) return null;
				return parseInt(phrase);
			},

			[ArgumentTypes.BIGINT]: (_message, phrase) => {
				if (!phrase || isNaN(+phrase)) return null;
				return BigInt(phrase);
			},

			// Just for fun.
			[ArgumentTypes.EMOJINT]: (_message, phrase) => {
				if (!phrase) return null;
				const n = phrase.replace(/0⃣|1⃣|2⃣|3⃣|4⃣|5⃣|6⃣|7⃣|8⃣|9⃣|🔟/g, m => {
					return ["0⃣", "1⃣", "2⃣", "3⃣", "4⃣", "5⃣", "6⃣", "7⃣", "8⃣", "9⃣", "🔟"].indexOf(m).toString();
				});

				if (isNaN(n as any)) return null;
				return parseInt(n);
			},

			[ArgumentTypes.URL]: (_message, phrase) => {
				if (!phrase) return null;
				if (/^<.+>$/.test(phrase)) phrase = phrase.slice(1, -1);

				try {
					return new URL(phrase);
				} catch {
					return null;
				}
			},

			[ArgumentTypes.DATE]: (_message, phrase) => {
				if (!phrase) return null;
				const timestamp = Date.parse(phrase);
				if (isNaN(timestamp)) return null;
				return new Date(timestamp);
			},

			[ArgumentTypes.COLOR]: (_message, phrase) => {
				if (!phrase) return null;

				const color = parseInt(phrase.replace("#", ""), 16);
				if (color < 0 || color > 0xffffff || isNaN(color)) {
					return null;
				}

				return color;
			},

			[ArgumentTypes.USER]: (_message, phrase) => {
				if (!phrase) return null;
				return this.client.util.resolveUser(phrase, this.client.users.cache);
			},

			[ArgumentTypes.USERS]: (_message, phrase) => {
				if (!phrase) return null;
				const users = this.client.util.resolveUsers(phrase, this.client.users.cache);
				return users.size ? users : null;
			},

			[ArgumentTypes.MEMBER]: (message, phrase) => {
				if (!phrase) return null;
				if (!message.inGuild()) return null;
				return this.client.util.resolveMember(phrase, message.guild.members.cache);
			},

			[ArgumentTypes.MEMBERS]: (message, phrase) => {
				if (!phrase) return null;
				if (!message.inGuild()) return null;
				const members = this.client.util.resolveMembers(phrase, message.guild.members.cache);
				return members.size ? members : null;
			},

			[ArgumentTypes.RELEVANT]: (message, phrase) => {
				if (!phrase) return null;

				const person = message.inGuild()
					? this.client.util.resolveMember(phrase, message.guild.members.cache)
					: this.client.util.resolveUser(
							phrase,
							new Collection([
								[(message.channel as DMChannel).recipientId, (message.channel as DMChannel).recipient!],
								[this.client.user!.id, this.client.user!]
							])
						);

				if (!person) return null;
				return message.guild ? (person as GuildMember).user : person;
			},

			[ArgumentTypes.RELEVANTS]: (message, phrase) => {
				if (!phrase) return null;
				const persons = message.inGuild()
					? this.client.util.resolveMembers(phrase, message.guild.members.cache)
					: this.client.util.resolveUsers(
							phrase,
							new Collection([
								[(message.channel as DMChannel).recipientId, (message.channel as DMChannel).recipient!],
								[this.client.user!.id, this.client.user!]
							])
						);

				if (!persons.size) return null;
				return message.inGuild() ? (persons as Collection<string, GuildMember>).mapValues(member => member.user) : persons;
			},

			[ArgumentTypes.CHANNEL]: (message, phrase) => {
				if (!phrase) return null;
				if (!message.inGuild()) return null;
				return this.client.util.resolveChannel(phrase, message.guild.channels.cache);
			},

			[ArgumentTypes.CHANNELS]: (message, phrase) => {
				if (!phrase) return null;
				if (!message.inGuild()) return null;
				const channels = this.client.util.resolveChannels(phrase, message.guild.channels.cache);
				return channels.size ? channels : null;
			},

			[ArgumentTypes.TEXT_CHANNEL]: this.singleChannelBuiltInType(this.isChannelTypeOf(ChannelType.GuildText)),

			[ArgumentTypes.TEXT_CHANNELS]: this.multipleChannelBuiltInType(this.isChannelTypeOf(ChannelType.GuildText)),

			[ArgumentTypes.VOICE_CHANNEL]: this.singleChannelBuiltInType(this.isChannelTypeOf(ChannelType.GuildVoice)),

			[ArgumentTypes.VOICE_CHANNELS]: this.multipleChannelBuiltInType(this.isChannelTypeOf(ChannelType.GuildVoice)),

			[ArgumentTypes.CATEGORY_CHANNEL]: this.singleChannelBuiltInType(this.isChannelTypeOf(ChannelType.GuildCategory)),

			[ArgumentTypes.CATEGORY_CHANNELS]: this.multipleChannelBuiltInType(this.isChannelTypeOf(ChannelType.GuildCategory)),

			[ArgumentTypes.ANNOUNCEMENT_CHANNEL]: this.singleChannelBuiltInType(this.isChannelTypeOf(ChannelType.GuildAnnouncement)),

			[ArgumentTypes.ANNOUNCEMENT_CHANNELS]: this.multipleChannelBuiltInType(this.isChannelTypeOf(ChannelType.GuildAnnouncement)),

			[ArgumentTypes.STAGE_CHANNEL]: this.singleChannelBuiltInType(this.isChannelTypeOf(ChannelType.GuildStageVoice)),

			[ArgumentTypes.STAGE_CHANNELS]: this.multipleChannelBuiltInType(this.isChannelTypeOf(ChannelType.GuildStageVoice)),

			[ArgumentTypes.THREAD_CHANNEL]: this.singleChannelBuiltInType((c): c is AnyThreadChannel => Boolean(c?.isThread())),

			[ArgumentTypes.THREAD_CHANNELS]: this.multipleChannelBuiltInType((c): c is AnyThreadChannel => c.isThread()),

			// @ts-expect-error
			[ArgumentTypes.DIRECTORY_CHANNEL]: this.singleChannelBuiltInType<DirectoryChannel>(
				this.isChannelTypeOf(ChannelType.GuildDirectory)
			),

			// @ts-expect-error
			[ArgumentTypes.DIRECTORY_CHANNELS]: this.multipleChannelBuiltInType<DirectoryChannel>(
				this.isChannelTypeOf(ChannelType.GuildDirectory)
			),

			[ArgumentTypes.FORUM_CHANNEL]: this.singleChannelBuiltInType(this.isChannelTypeOf(ChannelType.GuildForum)),

			[ArgumentTypes.FORUM_CHANNELS]: this.multipleChannelBuiltInType(this.isChannelTypeOf(ChannelType.GuildForum)),

			[ArgumentTypes.TEXT_BASED_CHANNEL]: this.singleChannelBuiltInType((c): c is GuildTextBasedChannel =>
				Boolean(c?.isTextBased())
			),

			[ArgumentTypes.TEXT_BASED_CHANNELS]: this.multipleChannelBuiltInType((c): c is GuildTextBasedChannel => c.isTextBased()),

			[ArgumentTypes.VOICE_BASED_CHANNEL]: this.singleChannelBuiltInType((c): c is VoiceBasedChannel =>
				Boolean(c?.isVoiceBased())
			),

			[ArgumentTypes.VOICE_BASED_CHANNELS]: this.multipleChannelBuiltInType((c): c is VoiceBasedChannel => c.isVoiceBased()),

			[ArgumentTypes.ROLE]: (message, phrase) => {
				if (!phrase) return null;
				if (!message.inGuild()) return null;
				return this.client.util.resolveRole(phrase, message.guild.roles.cache);
			},

			[ArgumentTypes.ROLES]: (message, phrase) => {
				if (!phrase) return null;
				if (!message.inGuild()) return null;
				const roles = this.client.util.resolveRoles(phrase, message.guild.roles.cache);
				return roles.size ? roles : null;
			},

			[ArgumentTypes.EMOJI]: (message, phrase) => {
				if (!phrase) return null;
				if (!message.inGuild()) return null;
				return this.client.util.resolveEmoji(phrase, message.guild.emojis.cache);
			},

			[ArgumentTypes.EMOJIS]: (message, phrase) => {
				if (!phrase) return null;
				if (!message.inGuild()) return null;
				const emojis = this.client.util.resolveEmojis(phrase, message.guild.emojis.cache);
				return emojis.size ? emojis : null;
			},

			[ArgumentTypes.GUILD]: (_message, phrase) => {
				if (!phrase) return null;
				return this.client.util.resolveGuild(phrase, this.client.guilds.cache);
			},

			[ArgumentTypes.GUILDS]: (_message, phrase) => {
				if (!phrase) return null;
				const guilds = this.client.util.resolveGuilds(phrase, this.client.guilds.cache);
				return guilds.size ? guilds : null;
			},

			[ArgumentTypes.MESSAGE]: (message, phrase) => {
				if (!phrase) return null;
				try {
					return message.channel.messages.fetch(phrase);
				} catch {
					return null;
				}
			},

			[ArgumentTypes.GUILD_MESSAGE]: async (message, phrase) => {
				if (!phrase) return null;
				if (!message.inGuild()) return null;
				for (const channel of message.guild.channels.cache.values()) {
					if (!channel.isTextBased()) continue;
					try {
						return await channel.messages.fetch(phrase);
					} catch (err) {
						if (/^Invalid Form Body/.test(err.message)) return null;
					}
				}

				return null;
			},

			[ArgumentTypes.RELEVANT_MESSAGE]: async (message, phrase) => {
				if (!phrase) return null;
				const hereMsg = await message.channel.messages.fetch(phrase).catch(() => null);
				if (hereMsg) {
					return hereMsg;
				}

				if (message.inGuild()) {
					for (const channel of message.guild.channels.cache.values()) {
						if (!channel.isTextBased()) continue;
						try {
							return await channel.messages.fetch(phrase);
						} catch (err) {
							if (/^Invalid Form Body/.test(err.message)) return null;
						}
					}
				}

				return null;
			},

			[ArgumentTypes.INVITE]: (_message, phrase) => {
				if (!phrase) return null;
				try {
					return this.client.fetchInvite(phrase);
				} catch {
					return null;
				}
			},

			[ArgumentTypes.USER_MENTION]: (_message, phrase) => {
				if (!phrase) return null;
				const id = phrase.match(/<@!?(\d{17,19})>/);
				if (!id) return null;
				return this.client.users.cache.get(id[1]) ?? null;
			},

			[ArgumentTypes.MEMBER_MENTION]: (message, phrase) => {
				if (!phrase) return null;
				if (!message.inGuild()) return null;
				const id = phrase.match(/<@!?(\d{17,19})>/);
				if (!id) return null;
				return message.guild.members.cache.get(id[1]) ?? null;
			},

			[ArgumentTypes.CHANNEL_MENTION]: (message, phrase) => {
				if (!phrase) return null;
				if (!message.inGuild()) return null;
				const id = phrase.match(/<#(\d{17,19})>/);
				if (!id) return null;
				return message.guild.channels.cache.get(id[1]) ?? null;
			},

			[ArgumentTypes.ROLE_MENTION]: (message, phrase) => {
				if (!phrase) return null;
				if (!message.guild) return null;
				const id = phrase.match(/<@&(\d{17,19})>/);
				if (!id) return null;
				return message.guild.roles.cache.get(id[1]) ?? null;
			},

			[ArgumentTypes.EMOJI_MENTION]: (message, phrase) => {
				if (!phrase) return null;
				if (!message.inGuild()) return null;
				const id = phrase.match(/<a?:[a-zA-Z0-9_]+:(\d{17,19})>/);
				if (!id) return null;
				return message.guild.emojis.cache.get(id[1]) ?? null;
			},

			[ArgumentTypes.COMMAND_ALIAS]: (_message, phrase) => {
				if (!phrase) return null;
				return this.commandHandler.findCommand(phrase) ?? null;
			},

			[ArgumentTypes.COMMAND]: (_message, phrase) => {
				if (!phrase) return null;
				return this.commandHandler.modules.get(phrase) ?? null;
			},

			[ArgumentTypes.INHIBITOR]: (_message, phrase) => {
				if (!phrase) return null;
				return this.inhibitorHandler?.modules.get(phrase) ?? null;
			},

			[ArgumentTypes.LISTENER]: (_message, phrase) => {
				if (!phrase) return null;
				return this.listenerHandler?.modules.get(phrase) ?? null;
			},

			[ArgumentTypes.TASK]: (_message, phrase) => {
				if (!phrase) return null;
				return this.taskHandler?.modules.get(phrase) ?? null;
			},

			[ArgumentTypes.CONTEXT_MENU_COMMAND]: (_message, phrase) => {
				if (!phrase) return null;
				return this.contextMenuCommandHandler?.modules.get(phrase) ?? null;
			}
		};

		for (const [key, value] of Object.entries(builtIns)) {
			this.types.set(key, value);
		}
	}

	/**
	 * Gets the resolver function for a type.
	 * @param name - Name of type.
	 */
	public type<T extends keyof BaseArgumentType>(name: T): OmitThisParameter<ArgumentTypeCaster<BaseArgumentType[T]>>;
	public type(name: string): OmitThisParameter<ArgumentTypeCaster> | undefined;
	public type(name: string): OmitThisParameter<ArgumentTypeCaster> | undefined {
		return this.types.get(name);
	}

	/**
	 * Adds a new type.
	 * @param name - Name of the type.
	 * @param fn - Function that casts the type.
	 */
	public addType(name: string, fn: ArgumentTypeCaster<any>): TypeResolver {
		this.types.set(name, fn);
		return this;
	}

	/**
	 * Adds multiple new types.
	 * @param types  - Object with keys as the type name and values as the cast function.
	 */
	public addTypes(types: Record<string, ArgumentTypeCaster<any>>): TypeResolver {
		for (const [key, value] of Object.entries(types)) {
			this.addType(key, value);
		}

		return this;
	}
}
