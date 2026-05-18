require('dotenv').config();
const https = require('https');
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder } = require('discord.js');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN || 'TON_TOKEN_ICI';
const CLIENT_ID = process.env.CLIENT_ID || 'TON_CLIENT_ID';
const GUILD_ID = process.env.GUILD_ID;

if (!DISCORD_TOKEN || DISCORD_TOKEN === 'TON_TOKEN_ICI' || !CLIENT_ID || CLIENT_ID === 'TON_CLIENT_ID') {
  console.error('ERREUR : ajoute ton token Discord dans DISCORD_TOKEN et ton CLIENT_ID dans le fichier .env.');
  process.exit(1);
}

const REPORT_CHANNEL_ID = '1398187982422278231';
const YOUTUBE_CHANNEL_URL = 'https://www.youtube.com/@Azaleees';
const ACTIVITY_ROLE_ID = '1398187980664868896';
const STAFF_ROLE_IDS = ['1457386435090059407', '1398187980664868895'];
const GIVEAWAY_ROLE_ID = '1398187980664868896';
const GIVEAWAY_PING_ROLE_ID = '1398187980618727565';
const MOD_ROLE_ID = '1398187980664868896';
const ANNONCE_ROLE_ID = '1398187980664868896'; // Rôle autorisé à faire .message

const getLatestVideoUrl = () => {
  return new Promise((resolve, reject) => {
    https.get('https://www.youtube.com/@Azaleees/videos', res => {
      let body = '';
      res.on('data', chunk => { body += chunk.toString(); });
      res.on('end', () => {
        const match = body.match(/\/watch\?v=[A-Za-z0-9_-]{11}/);
        if (!match) return reject(new Error('Aucune vidéo trouvée'));
        resolve(`https://www.youtube.com${match[0]}`);
      });
    }).on('error', reject);
  });
};

// Fonction giveaway séparée pour eviter les problèmes de closure
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
      { name: '📌 Titre', value: `\`\`\`${titre}\`\`\``, inline: false },
      { name: '⏳ Se termine', value: `<t:${Math.floor(finAt / 1000)}:R> • <t:${Math.floor(finAt / 1000)}:T>`, inline: false },
      { name: '👑 Organisé par', value: `${organisateur}`, inline: true },
      { name: '⏱️ Durée', value: `${temps} minute(s)`, inline: true },
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
      const fetchedMsg = await fetchedChannel.messages.fetch(messageId);
      const reaction = fetchedMsg.reactions.cache.get('🎉');

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
          { name: '📌 Titre', value: `\`\`\`${titre}\`\`\``, inline: false },
          { name: '🥇 Gagnant', value: `${winner}`, inline: true },
          { name: '🎟️ Participants', value: `${participants.size} personne(s)`, inline: true },
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
    .addUserOption(option =>
      option.setName('utilisateur').setDescription('Utilisateur à signaler').setRequired(true)
    )
    .addStringOption(option =>
      option.setName('raison').setDescription('Raison du report').setRequired(true)
    ),
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
(async () => {
  try {
    if (GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
      console.log('Commandes slash enregistrées pour le serveur (GUILD_ID).');
    } else {
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
      console.log('Commandes slash globales enregistrées. Attendez quelques minutes.');
    }
  } catch (error) {
    console.error('Erreur en enregistrant les commandes slash :', error);
  }
})();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
});

client.once('ready', () => {
  console.log(`Connecté en tant que ${client.user.tag}`);
});

client.on('messageCreate', async message => {
  if (message.author.bot) return;
  const content = message.content.trim();

  // .activity
  if (content.startsWith('.activity ')) {
    const hasRole = message.member && message.member.roles.cache.has(ACTIVITY_ROLE_ID);
    if (!hasRole) return;

    const newActivity = content.slice('.activity '.length).trim();
    if (!newActivity) return;

    client.user.setActivity(newActivity);
    const reply = await message.reply({ content: `✅ Message d'activité changé en : **${newActivity}**` });
    await message.delete().catch(() => {});
    setTimeout(() => reply.delete().catch(() => {}), 5000);
    return;
  }

  // .giveaway ou .giveways titre | prix | temps
  if (content.startsWith('.giveaway') || content.startsWith('.giveways')) {
    const hasRole = message.member && message.member.roles.cache.has(GIVEAWAY_ROLE_ID);
    if (!hasRole) {
      await message.delete().catch(() => {});
      return;
    }

    const prefix = content.startsWith('.giveways') ? '.giveways' : '.giveaway';
    const args = content.slice(prefix.length).trim();
    if (!args) {
      await message.reply('❌ Usage : `.giveways titre | prix | duree_en_minutes`');
      return;
    }

    const parts = args.split('|').map(p => p.trim());
    if (parts.length < 3) {
      await message.reply('❌ Usage : `.giveways titre | prix | duree_en_minutes`\nExemple : `.giveways PS5 | Une manette | 60`');
      return;
    }

    const [titre, prix, tempsText] = parts;
    const temps = parseInt(tempsText, 10);
    if (isNaN(temps) || temps < 1) {
      await message.reply('❌ La durée doit être un nombre entier en minutes (minimum 1).');
      return;
    }

    await message.delete().catch(() => {});
    await lancerGiveaway(message.channel, titre, prix, temps, message.author);
    return;
  }

  // .message titre | contenu | #salon(optionnel) | couleur(optionnel) | ping(optionnel)
  // Exemple : .message Titre | Contenu du message | #annonces | rose | true
  if (content.startsWith('.message ')) {
    const hasRole = message.member && message.member.roles.cache.has(ANNONCE_ROLE_ID);
    if (!hasRole) {
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
      await message.reply('❌ Il faut au minimum un **titre** et un **contenu**.\nUsage : `.message titre | contenu`');
      return;
    }

    const titre        = parts[0];
    const contenu      = parts[1].replace(/\\n/g, '\n');
    const salonMention = parts[2] ?? null;
    const choixCouleur = parts[3] ?? 'violet';
    const pingArg      = parts[4]?.toLowerCase() ?? 'false';
    const doPing       = pingArg === 'true' || pingArg === 'oui';

    // Résolution du salon cible
    let targetChannel = message.channel;
    if (salonMention) {
      const mentionMatch = salonMention.match(/(\d+)/);
      if (mentionMatch) {
        const found = message.guild.channels.cache.get(mentionMatch[1]);
        if (found && found.isTextBased()) targetChannel = found;
      }
    }

    // Palette de couleurs
    const couleurs = {
      violet: 0x9B59B6,
      bleu:   0x3498DB,
      vert:   0x2ECC71,
      rouge:  0xE74C3C,
      orange: 0xE67E22,
      jaune:  0xF1C40F,
      rose:   0xFF73FA,
    };
    const couleur = couleurs[choixCouleur] ?? couleurs.violet;

    const separateurs = {
      violet: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      bleu:   '▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬',
      vert:   '─────────────────────────────',
      rouge:  '▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔',
      orange: '══════════════════════════════',
      jaune:  '⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯',
      rose:   '✦·····························✦',
    };
    const separateur = separateurs[choixCouleur] ?? separateurs.violet;

    const embedAnnonce = new EmbedBuilder()
      .setTitle(`📢  ${titre}`)
      .setColor(couleur)
      .setDescription(
        `${separateur}\n\n` +
        `${contenu}\n\n` +
        `${separateur}`
      )
      .addFields(
        { name: '👑 Annonce par', value: `${message.author}`, inline: true },
        { name: '📅 Date', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
      )
      .setFooter({ text: 'Azaleees • Annonce officielle', iconURL: message.guild.iconURL({ dynamic: true }) ?? undefined })
      .setTimestamp();

    await message.delete().catch(() => {});

    try {
      await targetChannel.send({
        content: doPing ? '@everyone' : null,
        embeds: [embedAnnonce],
      });
    } catch (error) {
      console.error('Erreur lors de l\'envoi de l\'annonce :', error);
      await message.channel.send('❌ Impossible d\'envoyer l\'annonce. Vérifie que j\'ai les permissions d\'écrire dans ce salon.')
        .then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
    }
    return;
  }

  // .kick @user raison
  if (content.startsWith('.kick')) {
    const hasRole = message.member && message.member.roles.cache.has(MOD_ROLE_ID);
    if (!hasRole) {
      await message.delete().catch(() => {});
      return;
    }

    const mention = message.mentions.members.first();
    if (!mention) {
      await message.reply('❌ Usage : `.kick @utilisateur raison`');
      return;
    }

    const raison = content.slice(content.indexOf(mention.user.id) + mention.user.id.length + 1).replace(/[<>@!]/g, '').trim() || 'Aucune raison fournie';

    if (!mention.kickable) {
      await message.reply('❌ Je ne peux pas kick ce membre (rôle trop élevé).');
      return;
    }

    await mention.kick(raison);
    await message.delete().catch(() => {});

    const embedKick = new EmbedBuilder()
      .setTitle('👢 Membre kické')
      .setColor(0xE67E22)
      .addFields(
        { name: '👤 Membre', value: `${mention.user.tag} (${mention.user.id})`, inline: true },
        { name: '🛡️ Par', value: `${message.author}`, inline: true },
        { name: '📝 Raison', value: raison, inline: false },
      )
      .setTimestamp();

    await message.channel.send({ embeds: [embedKick] });
    return;
  }

  // .ban @user raison
  if (content.startsWith('.ban')) {
    const hasRole = message.member && message.member.roles.cache.has(MOD_ROLE_ID);
    if (!hasRole) {
      await message.delete().catch(() => {});
      return;
    }

    const mention = message.mentions.members.first();
    if (!mention) {
      await message.reply('❌ Usage : `.ban @utilisateur raison`');
      return;
    }

    const raison = content.slice(content.indexOf(mention.user.id) + mention.user.id.length + 1).replace(/[<>@!]/g, '').trim() || 'Aucune raison fournie';

    if (!mention.bannable) {
      await message.reply('❌ Je ne peux pas ban ce membre (rôle trop élevé).');
      return;
    }

    await mention.ban({ reason: raison });
    await message.delete().catch(() => {});

    const embedBan = new EmbedBuilder()
      .setTitle('🔨 Membre banni')
      .setColor(0xE74C3C)
      .addFields(
        { name: '👤 Membre', value: `${mention.user.tag} (${mention.user.id})`, inline: true },
        { name: '🛡️ Par', value: `${message.author}`, inline: true },
        { name: '📝 Raison', value: raison, inline: false },
      )
      .setTimestamp();

    await message.channel.send({ embeds: [embedBan] });
    return;
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'ping') {
    await interaction.reply('Pong 🏓');
    return;
  }

  if (interaction.commandName === 'aide') {
    const embed = new EmbedBuilder()
      .setTitle('📋 Commandes disponibles')
      .setColor(0x5865F2)
      .addFields(
        { name: '🏓 /ping', value: 'Répond avec Pong', inline: true },
        { name: '📺 /chaine', value: 'Lien vers la chaîne YouTube', inline: true },
        { name: '🎬 /video', value: 'Dernière vidéo YouTube', inline: true },
        { name: '🚨 /report [@user] [raison]', value: 'Signale un utilisateur', inline: true },
      
      )
      .setFooter({ text: 'Bot Azaleees' })
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
    return;
  }

  if (interaction.commandName === 'chaine') {
    await interaction.reply(`📺 Voici la chaîne YouTube : ${YOUTUBE_CHANNEL_URL}`);
    return;
  }

  if (interaction.commandName === 'video') {
    await interaction.deferReply();
    try {
      const latestVideo = await getLatestVideoUrl();
      await interaction.editReply(`🎬 Voici la dernière vidéo : ${latestVideo}`);
    } catch (error) {
      console.error('Erreur en récupérant la dernière vidéo :', error);
      await interaction.editReply(`❌ Impossible de trouver la dernière vidéo. Voici la chaîne : ${YOUTUBE_CHANNEL_URL}`);
    }
    return;
  }

  if (interaction.commandName === 'report') {
    const target = interaction.options.getUser('utilisateur');
    const reason = interaction.options.getString('raison');

    try {
      const reportChannel = await client.channels.fetch(REPORT_CHANNEL_ID);
      if (!reportChannel || !reportChannel.isTextBased()) {
        throw new Error('Salon de report introuvable.');
      }

      const embedReport = new EmbedBuilder()
        .setTitle('🚨 Nouveau report')
        .setColor(0xE74C3C)
        .addFields(
          { name: '🎯 Utilisateur signalé', value: `${target} (${target.id})`, inline: true },
          { name: '👤 Signalé par', value: `${interaction.user} (${interaction.user.id})`, inline: true },
          { name: '📝 Raison', value: reason, inline: false },
        )
        .setTimestamp();

      await reportChannel.send({ embeds: [embedReport] });
      await interaction.reply({ content: '✅ Ton report a bien été envoyé au staff.', ephemeral: true });
    } catch (error) {
      console.error('Erreur lors de l\'envoi du report :', error);
      await interaction.reply({ content: '❌ Impossible d\'envoyer le report pour le moment.', ephemeral: true });
    }
    return;
  }
});

client.login(DISCORD_TOKEN);
