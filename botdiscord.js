require('dotenv').config();
const https = require('https');
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require('discord.js');

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
const TICKET_CATEGORY_ID = '1398195786734506044';
const STAFF_ROLE_IDS = ['1457386435090059407', '1398187980664868895'];

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
      option
        .setName('utilisateur')
        .setDescription('Utilisateur à signaler')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('raison')
        .setDescription('Raison du report')
        .setRequired(true)
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
      console.log('Astuce : ajoute GUILD_ID à .env pour que la commande apparaisse immédiatement dans un serveur.');
    }
  } catch (error) {
    console.error('Erreur en enregistrant les commandes slash :', error);
  }
})();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
});

client.once('ready', () => {
  console.log(`Connecté en tant que ${client.user.tag}`);
});

// Commande .activity réservée au staff (invisible aux membres)
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  if (!message.content.startsWith('.activity ')) return;

  const hasRole = message.member && message.member.roles.cache.has(ACTIVITY_ROLE_ID);
  if (!hasRole) return; // on ignore silencieusement

  const newActivity = message.content.slice('.activity '.length).trim();
  if (!newActivity) return;

  client.user.setActivity(newActivity);
  await message.reply({ content: `✅ Message d'activité changé en : **${newActivity}**` });
  await message.delete().catch(() => {}); // supprime le message pour rester discret
});

client.on('interactionCreate', async interaction => {
  // Bouton fermer ticket
  if (interaction.isButton() && interaction.customId === 'fermer_ticket') {
    const isStaff = STAFF_ROLE_IDS.some(id => interaction.member.roles.cache.has(id));
    if (!isStaff) {
      await interaction.reply({ content: '❌ Seul le staff peut fermer un ticket.', ephemeral: true });
      return;
    }
    await interaction.reply({ content: '🔒 Ticket fermé, suppression dans 5 secondes...' });
    setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'ping') {
    await interaction.reply('Pong 🏓');
    return;
  }

  if (interaction.commandName === 'aide') {
    await interaction.reply(
      'Voici les commandes disponibles :\n' +
      '/ping - Répond Pong 🏓\n' +
      '/aide - Affiche cette aide\n' +
      '/chaine - Lien vers la chaîne YouTube Azaleees\n' +
      '/video - Lien vers la dernière vidéo YouTube\n' +
      '/ticket [sujet] - Ouvre un ticket pour contacter le staff\n' +
      '.activity [message] - Change le message d\'activité du bot (staff uniquement)\n' +
      '/report - Report un utilisateur au staff'
    );
    return;
  }

  if (interaction.commandName === 'chaine') {
    await interaction.reply(`Voici la chaîne YouTube : ${YOUTUBE_CHANNEL_URL}`);
    return;
  }

  if (interaction.commandName === 'video') {
    await interaction.deferReply();
    let ticketChannel = null;
    try {
      const latestVideo = await getLatestVideoUrl();
      await interaction.editReply(`Voici le lien vers la dernière vidéo : ${latestVideo}`);
    } catch (error) {
      console.error('Erreur en récupérant la dernière vidéo :', error);
      await interaction.editReply(`Je n'ai pas réussi à trouver la dernière vidéo. Voici la chaîne : ${YOUTUBE_CHANNEL_URL}`);
    }
    return;
  }

  if (interaction.commandName === 'ticket') {
    const sujet = interaction.options.getString('sujet');
    const guild = interaction.guild;

    // Vérifie si l'utilisateur a déjà un ticket ouvert
    const existing = guild.channels.cache.find(
      c => c.name === `ticket-${interaction.user.username.toLowerCase()}` && c.parentId === TICKET_CATEGORY_ID
    );
    if (existing) {
      await interaction.reply({ content: `❌ Tu as déjà un ticket ouvert : ${existing}`, ephemeral: true });
      return;
    }

    try {
      // Vérifie que la parent ID est bien une catégorie
      let parentIsCategory = false;
      if (TICKET_CATEGORY_ID) {
        const fetched = guild.channels.cache.get(TICKET_CATEGORY_ID) || await guild.channels.fetch(TICKET_CATEGORY_ID).catch(() => null);
        parentIsCategory = !!(fetched && fetched.type === ChannelType.GuildCategory);
      }

      const createOptions = {
        name: `ticket-${interaction.user.username.toLowerCase()}`,
        permissionOverwrites: [
          {
            id: guild.roles.everyone,
            deny: [PermissionFlagsBits.ViewChannel],
          },
          {
            id: interaction.user.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
          },
          ...STAFF_ROLE_IDS.map(roleId => ({
            id: roleId,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
          })),
        ],
      };

      if (parentIsCategory) {
        createOptions.parent = TICKET_CATEGORY_ID;
      } else if (TICKET_CATEGORY_ID) {
        console.warn('TICKET_CATEGORY_ID défini mais n\'est pas une catégorie. Le ticket sera créé sans parent.');
      }

      // Crée le salon ticket (avec ou sans parent selon vérif)
      ticketChannel = await guild.channels.create(createOptions);

      // Bouton fermer
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('fermer_ticket')
          .setLabel('🔒 Fermer le ticket')
          .setStyle(ButtonStyle.Danger)
      );

      await ticketChannel.send({
        content:
          `👋 Bienvenue ${interaction.user} !\n` +
          `📋 **Sujet :** ${sujet}\n\n` +
          `Le staff va te répondre dès que possible.\n` +
          `<@&${STAFF_ROLE_IDS[0]}> <@&${STAFF_ROLE_IDS[1]}>`,
        components: [row],
      });
    } catch (error) {
      console.error('Erreur lors de la création du ticket :', error);
      await interaction.reply({ content: 'Impossible de créer le ticket. Contacte un administrateur.', ephemeral: true });
    }

    if (ticketChannel) {
      await interaction.reply({ content: `✅ Ton ticket a été créé : ${ticketChannel}`, ephemeral: true });
    }
    return;
  }

  if (interaction.commandName === 'report') {
    const target = interaction.options.getUser('utilisateur');
    const reason = interaction.options.getString('raison');

    try {
      const reportChannel = await client.channels.fetch(REPORT_CHANNEL_ID);
      if (!reportChannel || !reportChannel.isTextBased()) {
        throw new Error('Le salon de report est introuvable ou n\'est pas un salon texte.');
      }

      await reportChannel.send(
        `📝 **Report**\n` +
        `Utilisateur signalé : ${target.tag} (${target.id})\n` +
        `Signalé par : ${interaction.user.tag} (${interaction.user.id})\n` +
        `Raison : ${reason}`
      );

      await interaction.reply({ content: 'Merci, le report a bien été envoyé au staff.', ephemeral: true });
    } catch (error) {
      console.error('Erreur lors de l\'envoi du report :', error);
      await interaction.reply({ content: 'Impossible d\'envoyer le report pour le moment.', ephemeral: true });
    }
  }
});

client.login(DISCORD_TOKEN);