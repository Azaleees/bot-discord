require('dotenv').config();
const https = require('https');
const { parseStringPromise } = require('xml2js');
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');

// ─────────────────────────────────────────────
//  CONFIG — Variables d'environnement (.env)
// ─────────────────────────────────────────────
const DISCORD_TOKEN  = process.env.DISCORD_TOKEN;
const CLIENT_ID      = process.env.CLIENT_ID;
const GUILD_ID       = process.env.GUILD_ID; // optionnel

if (!DISCORD_TOKEN || !CLIENT_ID) {
  console.error('❌  DISCORD_TOKEN ou CLIENT_ID manquant dans le .env');
  process.exit(1);
}

// ─────────────────────────────────────────────
//  IDs fixes
// ─────────────────────────────────────────────
const REPORT_CHANNEL_ID      = '1398187982422278231';
const YOUTUBE_CHANNEL_URL    = 'https://www.youtube.com/@Azaleees';
const ACTIVITY_ROLE_ID       = '1398187980664868896';
const GIVEAWAY_ROLE_ID       = '1398187980664868896';
const GIVEAWAY_PING_ROLE_ID  = '1398187980618727565';
const MOD_ROLE_ID            = '1398187980664868896';
const ANNONCE_ROLE_ID        = '1398187980664868896';

// ── YouTube notifs ────────────────────────────
const YOUTUBE_CHANNEL_ID   = process.env.YOUTUBE_CHANNEL_ID; // UC... (voir étapes)
const NOTIF_CHANNEL_ID     = '1398426864653172937';
const NOTIF_PING_ROLE_ID   = '1398425212420227192';
const YT_CHECK_INTERVAL_MS = 60_000; // vérification toutes les 60 secondes

// ─────────────────────────────────────────────
//  YOUTUBE — Récupération flux RSS
// ─────────────────────────────────────────────
let lastVideoId = null;

async function fetchLatestYouTubeVideo() {
  if (!YOUTUBE_CHANNEL_ID) return null;

  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${YOUTUBE_CHANNEL_ID}`;

  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', async () => {
        try {
          const parsed  = await parseStringPromise(body);
          const entries = parsed?.feed?.entry;
          if (!entries?.length) return resolve(null);

          const latest = entries[0];
          resolve({
            id    : latest['yt:videoId'][0],
            title : latest.title[0],
            url   : `https://www.youtube.com/watch?v=${latest['yt:videoId'][0]}`,
            thumb : `https://i.ytimg.com/vi/${latest['yt:videoId'][0]}/maxresdefault.jpg`,
          });
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', reject);
  });
}

async function checkYouTube(client) {
  try {
    const video = await fetchLatestYouTubeVideo();
    if (!video) return;

    // Première exécution : on initialise sans notifier
    if (lastVideoId === null) {
      lastVideoId = video.id;
      console.log(`[YouTube] Vidéo initiale mémorisée : ${video.title}`);
      return;
    }

    // Même vidéo qu'avant → rien à faire
    if (video.id === lastVideoId) return;

    // Nouvelle vidéo détectée !
    lastVideoId = video.id;
    console.log(`[YouTube] 🔴 Nouvelle vidéo détectée : ${video.title}`);

    const channel = await client.channels.fetch(NOTIF_CHANNEL_ID);
    if (!channel?.isTextBased()) return;

    const embed = new EmbedBuilder()
      .setTitle(`🎬  ${video.title}`)
      .setURL(video.url)
      .setColor(0xFF0000)
      .setDescription(
        `✦·····························✦\n\n` +
        `Une nouvelle vidéo vient d'être publiée sur la chaîne !\n\n` +
        `🔗 **[Regarder maintenant](${video.url})**\n\n` +
        `✦·····························✦`
      )
      .setImage(video.thumb)
      .addFields(
        { name: '📺 Chaîne', value: `[Azaleees](${YOUTUBE_CHANNEL_URL})`, inline: true },
        { name: '🕐 Publiée', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
      )
      .setFooter({ text: 'Azaleees • YouTube' })
      .setTimestamp();

    await channel.send({
      content: `<@&${NOTIF_PING_ROLE_ID}> 🔴 **Nouvelle vidéo en ligne !**`,
      embeds: [embed],
    });
  } catch (err) {
    console.error('[YouTube] Erreur lors du check :', err.message);
  }
}

// ─────────────────────────────────────────────
//  GIVEAWAY
// ─────────────────────────────────────────────
async function lancerGiveaway(channel, titre, prix, temps, organisateur) {
  const finAt = Date.now() + temps * 60 * 1000;

  const embedLancement = new EmbedBuilder()
    .setTitle('🎊  G I V E A W A Y  🎊')
    .setColor(0xFF73FA)
    .setDescription(
      `> 🏆 **${prix}**\n\n` +
      `╔════════════════════╗\n` +
      `  Réagis avec 🎉 pour tenter ta chance !\n` +
      `╚════════════════════╝`
    )
    .addFields(
      { name: '📌 Titre',       value: `\`\`\`${titre}\`\`\``,                                                              inline: false },
      { name: '⏳ Se termine',  value: `<t:${Math.floor(finAt / 1000)}:R> • <t:${Math.floor(finAt / 1000)}:T>`,             inline: false },
      { name: '👑 Organisé par', value: `${organisateur}`,                                                                  inline: true  },
      { name: '⏱️ Durée',       value: `${temps} minute(s)`,                                                                inline: true  },
    )
    .setFooter({ text: '🎉 Clique sur la réaction ci-dessous pour participer !' })
    .setTimestamp();

  const giveawayMsg = await channel.send({
    content: `||<@&${GIVEAWAY_PING_ROLE_ID}>|| 🎉 **Un giveaway vient d'être lancé !**`,
    embeds: [embedLancement],
  });
  await giveawayMsg.react('🎉');

  const channelId = channel.id;
  const messageId = giveawayMsg.id;

  setTimeout(async () => {
    try {
      const fetchedChannel = await channel.client.channels.fetch(channelId);
      const fetchedMsg     = await fetchedChannel.messages.fetch(messageId);
      const reaction       = fetchedMsg.reactions.cache.get('🎉');

      let participants = null;
      if (reaction) {
        const users = await reaction.users.fetch();
        participants = users.filter(u => !u.bot);
      }

      if (!participants || participants.size === 0) {
        const embedVide = new EmbedBuilder()
          .setTitle('😢 Giveaway terminé — Aucun participant')
          .setColor(0x808080)
          .setDescription(
            `Le giveaway **${titre}** est terminé mais personne n'a participé.\n\n` +
            `> 🏆 Prix non attribué : **${prix}**`
          )
          .setTimestamp();
        await fetchedChannel.send({ embeds: [embedVide] });
        return;
      }

      const winner = participants.random();
      const embedResultat = new EmbedBuilder()
        .setTitle('🥳  GIVEAWAY TERMINÉ  🥳')
        .setColor(0xFF73FA)
        .setDescription(
          `> 🏆 **${prix}**\n\n` +
          `╔════════════════════╗\n` +
          `  Félicitations au gagnant ! 🎊\n` +
          `╚════════════════════╝`
        )
        .addFields(
          { name: '📌 Titre',       value: `\`\`\`${titre}\`\`\``,             inline: false },
          { name: '🥇 Gagnant',     value: `${winner}`,                        inline: true  },
          { name: '🎟️ Participants', value: `${participants.size} personne(s)`, inline: true  },
        )
        .setFooter({ text: `Giveaway organisé par ${organisateur.tag ?? organisateur}` })
        .setTimestamp();

      await fetchedChannel.send({
        content: `🎊 ${winner} **félicitations, tu as gagné le giveaway !** 🎊`,
        embeds: [embedResultat],
      });
    } catch (err) {
      console.error('Erreur lors du tirage giveaway :', err);
    }
  }, temps * 60 * 1000);
}

// ─────────────────────────────────────────────
//  COMMANDES SLASH
// ─────────────────────────────────────────────
const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Répond avec Pong 🏓'),
  new SlashCommandBuilder()
    .setName('aide')
    .setDescription('Affiche la liste des commandes disponibles'),
  new SlashCommandBuilder()
    .setName('chaine')
    .setDescription('Donne un lien vers la chaîne YouTube Azaleees'),
  new SlashCommandBuilder()
    .setName('video')
    .setDescription('Donne un lien vers la dernière vidéo YouTube'),
  new SlashCommandBuilder()
    .setName('report')
    .setDescription('Reporte un utilisateur au staff')
    .addUserOption(opt =>
      opt.setName('utilisateur').setDescription('Utilisateur à signaler').setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('raison').setDescription('Raison du report').setRequired(true)
    ),
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
(async () => {
  try {
    if (GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
      console.log('✅ Commandes slash enregistrées pour le serveur (GUILD_ID).');
    } else {
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
      console.log('✅ Commandes slash globales enregistrées (jusqu\'à 1h de délai).');
    }
  } catch (err) {
    console.error('Erreur en enregistrant les commandes slash :', err);
  }
})();

// ─────────────────────────────────────────────
//  CLIENT DISCORD
// ─────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
});

// ─────────────────────────────────────────────
//  READY
// ─────────────────────────────────────────────
client.once('ready', () => {
  console.log(`✅ Connecté en tant que ${client.user.tag}`);

  if (!YOUTUBE_CHANNEL_ID) {
    console.warn('⚠️  YOUTUBE_CHANNEL_ID absent du .env — notifications YouTube désactivées.');
    return;
  }

  // Premier check pour mémoriser la dernière vidéo sans notifier
  checkYouTube(client);

  // Vérification toutes les 60 secondes
  setInterval(() => checkYouTube(client), YT_CHECK_INTERVAL_MS);
  console.log(`[YouTube] ✅ Polling actif (toutes les ${YT_CHECK_INTERVAL_MS / 1000}s)`);
});

// ─────────────────────────────────────────────
//  MESSAGES (commandes préfixées)
// ─────────────────────────────────────────────
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  const content = message.content.trim();

  // ── .activity ────────────────────────────────
  if (content.startsWith('.activity ')) {
    if (!message.member?.roles.cache.has(ACTIVITY_ROLE_ID)) return;

    const newActivity = content.slice('.activity '.length).trim();
    if (!newActivity) return;

    client.user.setActivity(newActivity);
    const reply = await message.reply({ content: `✅ Activité changée en : **${newActivity}**` });
    await message.delete().catch(() => {});
    setTimeout(() => reply.delete().catch(() => {}), 5000);
    return;
  }

  // ── .giveaway / .giveways ────────────────────
  if (content.startsWith('.giveaway') || content.startsWith('.giveways')) {
    if (!message.member?.roles.cache.has(GIVEAWAY_ROLE_ID)) {
      await message.delete().catch(() => {});
      return;
    }

    const prefix = content.startsWith('.giveways') ? '.giveways' : '.giveaway';
    const args   = content.slice(prefix.length).trim();

    if (!args) {
      await message.reply('❌ Usage : `.giveaway titre | prix | durée_en_minutes`');
      return;
    }

    const parts = args.split('|').map(p => p.trim());
    if (parts.length < 3) {
      await message.reply('❌ Usage : `.giveaway titre | prix | durée_en_minutes`\nExemple : `.giveaway PS5 | Une manette | 60`');
      return;
    }

    const [titre, prix, tempsText] = parts;
    const temps = parseInt(tempsText, 10);
    if (isNaN(temps) || temps < 1) {
      await message.reply('❌ La durée doit être un entier en minutes (minimum 1).');
      return;
    }

    await message.delete().catch(() => {});
    await lancerGiveaway(message.channel, titre, prix, temps, message.author);
    return;
  }

  // ── .message ─────────────────────────────────
  // Usage : .message titre | contenu | #salon(opt) | couleur(opt) | ping(opt)
  if (content.startsWith('.message ')) {
    if (!message.member?.roles.cache.has(ANNONCE_ROLE_ID)) {
      await message.delete().catch(() => {});
      return;
    }

    const args = content.slice('.message '.length).trim();
    if (!args) {
      await message.reply('❌ Usage : `.message titre | contenu | #salon(opt) | couleur(opt) | ping(opt)`');
      return;
    }

    const parts = args.split('|').map(p => p.trim());
    if (parts.length < 2) {
      await message.reply('❌ Il faut au minimum un **titre** et un **contenu**.');
      return;
    }

    const titre        = parts[0];
    const contenu      = parts[1].replace(/\\n/g, '\n');
    const salonMention = parts[2] ?? null;
    const choixCouleur = parts[3] ?? 'violet';
    const doPing       = ['true', 'oui'].includes(parts[4]?.toLowerCase());

    let targetChannel = message.channel;
    if (salonMention) {
      const match = salonMention.match(/(\d+)/);
      if (match) {
        const found = message.guild.channels.cache.get(match[1]);
        if (found?.isTextBased()) targetChannel = found;
      }
    }

    const couleurs = {
      violet: 0x9B59B6, bleu: 0x3498DB, vert: 0x2ECC71,
      rouge: 0xE74C3C, orange: 0xE67E22, jaune: 0xF1C40F, rose: 0xFF73FA,
    };
    const separateurs = {
      violet: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      bleu:   '▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬',
      vert:   '─────────────────────────────',
      rouge:  '▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔',
      orange: '══════════════════════════════',
      jaune:  '⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯',
      rose:   '✦·····························✦',
    };

    const couleur    = couleurs[choixCouleur]    ?? couleurs.violet;
    const separateur = separateurs[choixCouleur] ?? separateurs.violet;

    const embedAnnonce = new EmbedBuilder()
      .setTitle(`📢  ${titre}`)
      .setColor(couleur)
      .setDescription(`${separateur}\n\n${contenu}\n\n${separateur}`)
      .addFields(
        { name: '👑 Annonce par', value: `${message.author}`,                           inline: true },
        { name: '📅 Date',        value: `<t:${Math.floor(Date.now() / 1000)}:F>`,      inline: true },
      )
      .setFooter({ text: 'Azaleees • Annonce officielle', iconURL: message.guild.iconURL({ dynamic: true }) ?? undefined })
      .setTimestamp();

    await message.delete().catch(() => {});
    try {
      await targetChannel.send({ content: doPing ? '@everyone' : null, embeds: [embedAnnonce] });
    } catch {
      await message.channel.send('❌ Impossible d\'envoyer l\'annonce (permissions insuffisantes).')
        .then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
    }
    return;
  }

  // ── .kick ────────────────────────────────────
  if (content.startsWith('.kick')) {
    if (!message.member?.roles.cache.has(MOD_ROLE_ID)) {
      await message.delete().catch(() => {});
      return;
    }

    const mention = message.mentions.members.first();
    if (!mention) { await message.reply('❌ Usage : `.kick @utilisateur raison`'); return; }

    const raison = content.slice(content.indexOf(mention.user.id) + mention.user.id.length + 1)
      .replace(/[<>@!]/g, '').trim() || 'Aucune raison fournie';

    if (!mention.kickable) { await message.reply('❌ Je ne peux pas kick ce membre (rôle trop élevé).'); return; }

    await mention.kick(raison);
    await message.delete().catch(() => {});
    await message.channel.send({
      embeds: [new EmbedBuilder()
        .setTitle('👢 Membre kické').setColor(0xE67E22)
        .addFields(
          { name: '👤 Membre', value: `${mention.user.tag} (${mention.user.id})`, inline: true },
          { name: '🛡️ Par',   value: `${message.author}`,                        inline: true },
          { name: '📝 Raison', value: raison,                                    inline: false },
        ).setTimestamp()],
    });
    return;
  }

  // ── .ban ─────────────────────────────────────
  if (content.startsWith('.ban')) {
    if (!message.member?.roles.cache.has(MOD_ROLE_ID)) {
      await message.delete().catch(() => {});
      return;
    }

    const mention = message.mentions.members.first();
    if (!mention) { await message.reply('❌ Usage : `.ban @utilisateur raison`'); return; }

    const raison = content.slice(content.indexOf(mention.user.id) + mention.user.id.length + 1)
      .replace(/[<>@!]/g, '').trim() || 'Aucune raison fournie';

    if (!mention.bannable) { await message.reply('❌ Je ne peux pas ban ce membre (rôle trop élevé).'); return; }

    await mention.ban({ reason: raison });
    await message.delete().catch(() => {});
    await message.channel.send({
      embeds: [new EmbedBuilder()
        .setTitle('🔨 Membre banni').setColor(0xE74C3C)
        .addFields(
          { name: '👤 Membre', value: `${mention.user.tag} (${mention.user.id})`, inline: true },
          { name: '🛡️ Par',   value: `${message.author}`,                        inline: true },
          { name: '📝 Raison', value: raison,                                    inline: false },
        ).setTimestamp()],
    });
    return;
  }
});

// ─────────────────────────────────────────────
//  INTERACTIONS (slash commands)
// ─────────────────────────────────────────────
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  // /ping
  if (interaction.commandName === 'ping') {
    await interaction.reply('Pong 🏓');
    return;
  }

  // /aide
  if (interaction.commandName === 'aide') {
    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setTitle('📋 Commandes disponibles').setColor(0x5865F2)
        .addFields(
          { name: '🏓 /ping',                    value: 'Répond avec Pong',              inline: true },
          { name: '📺 /chaine',                  value: 'Lien vers la chaîne YouTube',   inline: true },
          { name: '🎬 /video',                   value: 'Dernière vidéo YouTube',         inline: true },
          { name: '🚨 /report [@user] [raison]', value: 'Signale un utilisateur',        inline: true },
        )
        .setFooter({ text: 'Bot Azaleees' }).setTimestamp()],
    });
    return;
  }

  // /chaine
  if (interaction.commandName === 'chaine') {
    await interaction.reply(`📺 Voici la chaîne YouTube : ${YOUTUBE_CHANNEL_URL}`);
    return;
  }

  // /video
  if (interaction.commandName === 'video') {
    await interaction.deferReply();
    try {
      const video = await fetchLatestYouTubeVideo();
      if (!video) throw new Error('Aucune vidéo trouvée');
      await interaction.editReply(`🎬 Voici la dernière vidéo : ${video.url}`);
    } catch {
      await interaction.editReply(`❌ Impossible de trouver la dernière vidéo. Chaîne : ${YOUTUBE_CHANNEL_URL}`);
    }
    return;
  }

  // /report
  if (interaction.commandName === 'report') {
    const target = interaction.options.getUser('utilisateur');
    const reason = interaction.options.getString('raison');

    try {
      const reportChannel = await client.channels.fetch(REPORT_CHANNEL_ID);
      if (!reportChannel?.isTextBased()) throw new Error('Salon de report introuvable.');

      await reportChannel.send({
        embeds: [new EmbedBuilder()
          .setTitle('🚨 Nouveau report').setColor(0xE74C3C)
          .addFields(
            { name: '🎯 Utilisateur signalé', value: `${target} (${target.id})`,               inline: true },
            { name: '👤 Signalé par',         value: `${interaction.user} (${interaction.user.id})`, inline: true },
            { name: '📝 Raison',              value: reason,                                   inline: false },
          ).setTimestamp()],
      });
      await interaction.reply({ content: '✅ Ton report a bien été envoyé au staff.', ephemeral: true });
    } catch {
      await interaction.reply({ content: '❌ Impossible d\'envoyer le report pour le moment.', ephemeral: true });
    }
    return;
  }
});

// ─────────────────────────────────────────────
//  LOGIN
// ─────────────────────────────────────────────
client.login(DISCORD_TOKEN);
