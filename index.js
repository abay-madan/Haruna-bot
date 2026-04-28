const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, downloadContentFromMessage } = require("@whiskeysockets/baileys")
const qrcode = require('qrcode-terminal')
const pino = require("pino")
const axios = require("axios")
const { Sticker, StickerTypes } = require('wa-sticker-formatter')

// --- BAGIAN GEMINI AI ---
const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI("AIzaSyABQa9AJhBxkNxLreTjg-b40HnvL-VkXMI"); // Ganti pake API Key lo Bar!
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('session')
    const { version } = await fetchLatestBaileysVersion()
    
    const conn = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        version,
        printQRInTerminal: false,
        browser: ['Haruna-Bot', 'Edge', '1.0.0']
    })

    conn.ev.on('creds.update', saveCreds)
    // --- FITUR GROUP MANAGER: WELCOME & GOODBYE (FIXED 404) ---
    conn.ev.on('group-participants.update', async (anu) => {
        try {
            let metadata = await conn.groupMetadata(anu.id)
            let participants = anu.participants
            
            for (let p of participants) {
                let jid = p.id || p 
                
                // 1. Ambil Foto Profil
                let ppuser
                try {
                    // Coba ambil PP asli
                    ppuser = await conn.profilePictureUrl(jid, 'image')
                } catch {
                    // Kalo gak ada, pake link placeholder yang lebih stabil (via UI-Avatars)
                    ppuser = `https://ui-avatars.com/api/?name=${jid.split("@")[0]}&background=random&color=fff`
                }

                if (anu.action == 'add') {
                    let teksWelcome = `Halo @${jid.split("@")[0]} 👋\n\nSelamat datang di grup *${metadata.subject}*!\n\nSemoga betah di sini ya bub. Jangan lupa baca deskripsi!`
                    
                    try {
                        await conn.sendMessage(anu.id, { 
                            image: { url: ppuser }, 
                            caption: teksWelcome,
                            mentions: [jid] 
                        })
                    } catch {
                        // Kalo kirim gambar GAGAL (masalah internet/link), kirim teks aja biar gak error
                        await conn.sendMessage(anu.id, { text: teksWelcome, mentions: [jid] })
                    }

                } else if (anu.action == 'remove') {
                    let teksGoodbye = `Yah, si @${jid.split("@")[0]} keluar... 😖\n\nSelamat tinggal, semoga tenang di luar sana!`
                    
                    try {
                        await conn.sendMessage(anu.id, { 
                            image: { url: ppuser }, 
                            caption: teksGoodbye,
                            mentions: [jid] 
                        })
                    } catch {
                        await conn.sendMessage(anu.id, { text: teksGoodbye, mentions: [jid] })
                    }
                }
            }
        } catch (err) {
            console.log("Error Welcome:", err)
        }
    })
    conn.ev.on('messages.upsert', async m => {
        try {
            const msg = m.messages[0]
            if (!msg.message || msg.key.fromMe) return
            const from = msg.key.remoteJid
            const type = Object.keys(msg.message)[0]
            const pushName = msg.pushName || "dek"
            
            let body = (type === 'conversation') ? msg.message.conversation : (type === 'extendedTextMessage') ? msg.message.extendedTextMessage.text : (type === 'imageMessage') ? msg.message.imageMessage.caption : ''
            const text = body.trim().split(/ +/).slice(1).join(" ")
            const command = body.toLowerCase().split(' ')[0]

            switch (command) {
                case '.menu':
                case '.help':
                    const menuText = `
*🤖 HARUNA GEMINI EDITION*
*Status:* Online 🟢

Halo semuanya! Berikut adalah daftar mantra sihir Haruna yang bisa kalian gunakan:

*🛠️ DOWNLOADER & UTILITY*
➤ *.tt [link]* - Download video TikTok (No WM)
➤ *.s / .stiker* - Gambar/Video ke stiker petak (Max 10s)
➤ *.wm [Teks1] | [Teks2]* - Nyolong stiker & ganti WM
➤ *.toimg* - (Reply stiker) Ubah stiker jadi foto
➤ *.tts / .say [teks]* - Ubah teks jadi Voice Note

*🎮 FUN & AI*
➤ *.khodam [nama]* - Cek khodam lucu-lucuan
➤ *.jodoh* - Ramal pasangan member di grup
➤ *.image [teks]* - Haruna bakal gambarin imajinasi kalian
➤ *.brat [teks]* - Bikin stiker tulisan hijau neon
➤ *Chat Langsung* - Haruna punya otak AI Gemini, tanya apa aja bebas!

*👑 GROUP & ADMIN*
➤ *.h [teks]* - Hidetag (Tag secara gaib)
➤ *.tagall [teks]* - Tag semua member secara terbuka
➤ *.kick* - (Reply target) Tendang member
➤ *.promote* - (Reply target) Naikin jadi Admin
➤ *.demote* - (Reply target) Turunkan jabatan
➤ *.del* - (Reply pesan bot) Hapus pesan Haruna

*⚙️ SYSTEM INFO*
➤ *.ping* - Cek kecepatan respon bot
➤ *.runtime* - Cek berapa lama bot sudah aktif

_Pesan: Gunakan bot dengan bijak ya!_ 🚀
`
                    await conn.sendMessage(from, {
                        text: menuText,
                        contextInfo: {
                            forwardingScore: 999,
                            isForwarded: true,
                            forwardedNewsletterMessageInfo: {
                                newsletterName: "Haruna Bot Updates",
                                newsletterJid: "120363123456789@newsletter",
                            }
                        }
                    }, { quoted: msg })
                    break

                case '.ping':
                case '.p':
                    const start = new Date().getTime()
                    await conn.sendMessage(from, { text: '_Testing sinyal..._' }, { quoted: msg })
                    const end = new Date().getTime()
                    const ping = end - start
                    await conn.sendMessage(from, { text: `*Pong!* 🏓\nRespon: *${ping}ms*` }, { quoted: msg })
                    break

                case '.runtime':
                case '.tes':
                    const uptime = process.uptime()
                    const hours = Math.floor(uptime / 3600)
                    const minutes = Math.floor((uptime % 3600) / 60)
                    const seconds = Math.floor(uptime % 60)
                    
                    const teksRun = `*🤖 HARUNA UPTIME*\n\nBot sudah aktif selama:\n*${hours} Jam, ${minutes} Menit, ${seconds} Detik*\n\n_Server: Hugging Face (Coming Soon)_ 🚀`
                    await conn.sendMessage(from, { text: teksRun }, { quoted: msg })
                    break

                case '.ai':
                    if (!text) return conn.sendMessage(from, { text: 'Mau tanya apa sama Gemini, dek?' })
                    await conn.sendMessage(from, { text: '_Gemini lagi ngetik..._' })
                    try {
                        const result = await model.generateContent(text);
                        const response = await result.response;
                        const hasil = response.text();
                        await conn.sendMessage(from, { text: hasil });
                    } catch (e) {
                        console.log(e)
                        await conn.sendMessage(from, { text: 'Aduh dek, Gemini-nya lagi limit atau API Key lo salah!' })
                    }
                    break

                case '.s':
                case '.stiker':
                case '.sticker':
                    try {
                        // 1. Cek pesannya, ini gambar/video atau bukan?
                        const type = Object.keys(msg.message)[0]
                        const isMedia = (type === 'imageMessage' || type === 'videoMessage')
                        const isQuotedMedia = type === 'extendedTextMessage' && (
                            msg.message.extendedTextMessage.contextInfo.quotedMessage.imageMessage || 
                            msg.message.extendedTextMessage.contextInfo.quotedMessage.videoMessage
                        )

                        if (!isMedia && !isQuotedMedia) {
                            return await conn.sendMessage(from, { text: 'Bos, kirim gambar/video (max 10 detik) pake caption *.s*, atau reply gambar/video-nya!' }, { quoted: msg })
                        }

                        await conn.sendMessage(from, { text: '_Lagi digosok jadi stiker petak... Tunggu bentar Bos!_ ⏳' })

                        // 2. Ambil tipe pesannya
                        const messageData = isQuotedMedia ? msg.message.extendedTextMessage.contextInfo.quotedMessage : msg.message
                        const messageType = Object.keys(messageData)[0]

                        // 3. Batasi video maksimal 10 detik (biar laptop lo ga ngebul rendernya)
                        if (messageType === 'videoMessage' && messageData.videoMessage.seconds > 10) {
                            return await conn.sendMessage(from, { text: 'Waduh Bos, videonya kepanjangan! Maksimal 10 detik aja ya.' }, { quoted: msg })
                        }

                        // 4. Download file asli (gambar/video)
                        const { downloadContentFromMessage } = require('@whiskeysockets/baileys')
                        const stream = await downloadContentFromMessage(messageData[messageType], messageType.replace('Message', ''))
                        let buffer = Buffer.from([])
                        for await(const chunk of stream) {
                            buffer = Buffer.concat([buffer, chunk])
                        }

                        // 5. Bikin file sementara
                        const fs = require('fs')
                        const crypto = require('crypto')
                        const randomName = crypto.randomBytes(6).toString('hex')
                        const tempInput = `./temp_${randomName}.${messageType === 'imageMessage' ? 'jpg' : 'mp4'}`
                        const tempOutput = `./temp_${randomName}.webp`
                        fs.writeFileSync(tempInput, buffer)

                        // 6. Proses Mesin Render FFMPEG (Versi Diet)
                        const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path
                        const ffmpeg = require('fluent-ffmpeg')
                        ffmpeg.setFfmpegPath(ffmpegPath)

                        ffmpeg(tempInput)
                            .addOutputOptions([
                                '-vcodec', 'libwebp',
                                // Motong petak + Turunin FPS biar file enteng (Maks 15 FPS)
                                '-vf', "crop=w='min(iw,ih)':h='min(iw,ih)',scale=512:512,fps=15",
                                '-lossless', '0',
                                '-qscale', '30', // Turunin dari 50 ke 30 biar sizenya kecil
                                '-preset', 'default',
                                '-loop', '0',
                                '-an', 
                                '-vsync', '0'
                            ])
                            .save(tempOutput)
                            .on('end', async () => {
                                // --- PROSES WATERMARK ---
                                try {
                                    const webp = require('node-webpmux')
                                    const img = new webp.Image()
                                    await img.load(tempOutput)
                                    const json = { 'sticker-pack-name': "Haruna Bot 🤖", 'sticker-pack-publisher': "Abay Grup" }
                                    const exifAttr = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00])
                                    const jsonBuff = Buffer.from(JSON.stringify(json), 'utf-8')
                                    const exif = Buffer.concat([exifAttr, jsonBuff])
                                    exif.writeUIntLE(jsonBuff.length, 14, 4)
                                    img.exif = exif
                                    await img.save(tempOutput) 
                                } catch (e) { console.log(e) }

                                // Kirim stiker
                                await conn.sendMessage(from, { sticker: { url: tempOutput } }, { quoted: msg })
                                
                                fs.unlinkSync(tempInput)
                                fs.unlinkSync(tempOutput)
                            })
                            .on('error', async (err) => {
                                console.log("Error Mesin Stiker:", err)
                                await conn.sendMessage(from, { text: 'Waduh, gagal ngerender stiker nih Bos! 😭' }, { quoted: msg })
                                fs.unlinkSync(tempInput)
                            })

                    } catch (err) {
                        console.log("Error Download Media:", err)
                        await conn.sendMessage(from, { text: 'Aduh Bos, ada yang error pas narik medianya!' }, { quoted: msg })
                    }
                    break

// ... (sisanya tetep sama sampe ke switch command) ...

                case '.tt':
                case '.tiktok':
                    if (!text) return conn.sendMessage(from, { text: 'Linknya mana Bar?' })
                    
                    await conn.sendMessage(from, { text: `_Bentar Bar, kita tembus pake jalur VVIP TikWM..._ 🚁` })
                    
                    try {
                        // JALUR VVIP: TIKWM (Server Khusus Bot)
                        const res = await axios.get(`https://www.tikwm.com/api/?url=${text}`)
                        
                        // TikWM naruh link videonya di res.data.data.play
                        if (res.data && res.data.data && res.data.data.play) {
                            const videoUrl = res.data.data.play
                            const judul = res.data.data.title || 'Nih videonya!'
                            
                            await conn.sendMessage(from, { 
                                video: { url: videoUrl }, 
                                caption: `*TIKTOK DOWNLOADER* ✅\n\n*Judul:* ${judul}\n\n_Akhirnya tembus juga Bar!_` 
                            }, { quoted: msg })
                        } else {
                            throw new Error("TikWM nolak link ini")
                        }
                    } catch (e) {
                        console.log("Error TikWM:", e.message)
                        await conn.sendMessage(from, { text: 'Duh Bar, TikWM juga lagi tiarap. Beneran lagi susah banget nembus TikTok siang ini! 😭' })
                    }
                    break
                
                
                case '.tts':
                case '.say':
                    if (!text) return conn.sendMessage(from, { text: 'Mana teksnya Bar? Contoh: *.say Halo Haruna di sini*' })
                    
                    try {
                        const urlTTS = `https://translate.google.com/translate_tts?ie=UTF-8&tl=id&client=tw-ob&q=${encodeURIComponent(text)}`
                        
                        await conn.sendMessage(from, { 
                            audio: { url: urlTTS }, 
                            mimetype: 'audio/mpeg', // Fix: Disesuaikan dengan format asli Google (MP3)
                            // ptt: true <-- Ini kita hapus biar WA di HP gak bingung
                        }, { quoted: msg })
                        
                    } catch (e) {
                        console.log("Error TTS:", e.message)
                        await conn.sendMessage(from, { text: 'Aduh Bar, bot Haruna lagi radang tenggorokan. Gagal ngomong! 😭' })
                    }
                    break


                case '.h':
                case '.hidetag':
                case '.pengumuman':
                    // 1. Cek dulu apakah ini dipake di dalem grup
                    if (!from.endsWith('@g.us')) {
                        return await conn.sendMessage(from, { text: 'Woy Bos! Fitur ini khusus dipake di dalem grup aja ya!' }, { quoted: msg })
                    }
                    
                    // 2. Cek apakah ada teks pengumumannya
                    if (!text) {
                        return await conn.sendMessage(from, { text: 'Teks pengumumannya mana Bos?\nContoh: *.hidetag Besok mabar jam 8 malem!*' }, { quoted: msg })
                    }

                    try {
                        // 3. Ambil data grup buat ngintip siapa aja membernya
                        let groupMetadata = await conn.groupMetadata(from)
                        let participants = groupMetadata.participants
                        
                        // 4. Kumpulin semua ID (nomor WA) member yang ada di grup itu
                        let memberIds = participants.map(a => a.id)

                        // 5. Kirim pesannya! 
                        // Teksnya murni isi pesan lo, tapi di belakang layar (mentions) kita masukin semua ID member.
                        await conn.sendMessage(from, { 
                            text: `*PENGUMUMAN GRUP* 📢\n\n${text}`, 
                            mentions: memberIds 
                        })
                        
                    } catch (err) {
                        console.log("Error Hidetag:", err)
                        await conn.sendMessage(from, { text: 'Aduh Bos, Haruna gagal ngumpulin data member nih. Coba lagi ya!' })
                    }
                    break

                case '.khodam':
                case '.cekkhodam':
                    if (!text) {
                        return await conn.sendMessage(from, { text: 'Siapa namanya Bos yang mau dicek?\nContoh: *.khodam Nanda*' }, { quoted: msg })
                    }

                    // Daftar khodam absurd (Lo bisa tambahin atau ganti isinya di sini)
                    const listKhodam = [
                        "Knalpot Supra X",
                        "Harimau Cisewu",
                        "Kucing Oren Garong",
                        "Nasi Padang Karet Dua",
                        "Kipas Angin Cosmos",
                        "Bapak-bapak Komplek",
                        "CCTV Warnet",
                        "Biawak Darat",
                        "Macan Tutul Ompong",
                        "Sapu Lidi Patah",
                        "Galon Le Minerale",
                        "Tuyul Magang",
                        // Nyempil jokes IT dikit
                        "Error PHP Baris 404",
                        "Server Laragon Ngelag",
                        "Kabel LAN Putus",
                        "Database MySQL Jebol",
                        "Admin Bojeri"
                    ]

                    // Ngacak array biar dapet hasil random
                    const khodamRandom = listKhodam[Math.floor(Math.random() * listKhodam.length)]

                    // Bikin efek loading bohongan biar kelihatan mikir
                    await conn.sendMessage(from, { text: `_Menerawang khodam si ${text}..._ 🧘‍♂️💨` })

                    // Jeda 2 detik sebelum ngirim hasil
                    setTimeout(async () => {
                        const teksKhodam = `*🔮 CEK KHODAM HARUNA 🔮*\n\n👤 Nama: *${text}*\n👻 Khodam: *${khodamRandom}*\n\n🤣`
                        await conn.sendMessage(from, { text: teksKhodam }, { quoted: msg })
                    }, 2000)
                    
                    break
                
                case '.image':
                case '.gambar':
                case '.gbr':
                    if (!text) {
                        return await conn.sendMessage(from, { text: 'Mau Haruna gambarin apa nih?\nContoh: *.image kucing oren pakai kacamata hitam sedang ngoding*' }, { quoted: msg })
                    }

                    // Kasih respon biar member tau botnya lagi kerja
                    await conn.sendMessage(from, { text: `_Haruna lagi siapin kuas dan kanvas... Tunggu bentar ya!_ 🎨✨` })

                    try {
                        // Kita pake Pollinations AI (Gratis, gak pake limit ribet, langsung jadi gambar)
                        const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(text)}`
                        
                        // Kirim langsung url-nya sebagai gambar
                        await conn.sendMessage(from, { 
                            image: { url: imageUrl }, 
                            caption: `*AI IMAGE GENERATOR* 🎨\n\n*Prompt:* _${text}_\n\n_Nih gambarnya udah jadi!_` 
                        }, { quoted: msg })
                        
                    } catch (err) {
                        console.log("Error Image AI:", err.message)
                        await conn.sendMessage(from, { text: 'Waduh, cat air Haruna tumpah. Gagal bikin gambar nih Bos! 😭' })
                    }
                    break

                case '.tagall':
                case '.semua':
                    // 1. Cek apakah ini di dalam grup
                    if (!from.endsWith('@g.us')) return conn.sendMessage(from, { text: 'Fitur ini cuma bisa di grup, Bos!' }, { quoted: msg })
                    
                    try {
                        const groupMetadata = await conn.groupMetadata(from)
                        const participants = groupMetadata.participants
                        
                        let teks = `*📢 TAG ALL MEMBER*\n\n*Pesan:* ${text ? text : 'Tanpa Pesan'}\n\n`
                        let mems = []
                        
                        // 2. Susun daftar mention-nya
                        for (let mem of participants) {
                            teks += ` @${mem.id.split('@')[0]}\n`
                            mems.push(mem.id)
                        }
                        
                        teks += `\n_Total: ${participants.length} Member_`

                        // 3. Kirim pesan dengan mention yang sudah dikumpulkan
                        await conn.sendMessage(from, { 
                            text: teks, 
                            mentions: mems 
                        }, { quoted: msg })

                    } catch (err) {
                        console.log("Error Tagall:", err)
                        await conn.sendMessage(from, { text: 'Gagal ngetag semua member nih Bos!' })
                    }
                    break

                case '.toimg':
                case '.toimage':
                    try {
                        // 1. Cek apakah lo nge-reply stiker
                        const isQuotedSticker = msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.stickerMessage
                        if (!isQuotedSticker) return conn.sendMessage(from, { text: 'Reply stikernya terus ketik *.toimg* Bos!' }, { quoted: msg })

                        await conn.sendMessage(from, { text: '_Lagi dibongkar jadi foto... Tunggu bentar!_ 🛠️' })

                        // 2. Download stikernya
                        const { downloadContentFromMessage } = require('@whiskeysockets/baileys')
                        const stickerData = msg.message.extendedTextMessage.contextInfo.quotedMessage.stickerMessage
                        const stream = await downloadContentFromMessage(stickerData, 'sticker')
                        let buffer = Buffer.from([])
                        for await(const chunk of stream) {
                            buffer = Buffer.concat([buffer, chunk])
                        }

                        // 3. Simpan sementara & Konversi pake FFMPEG (WebP -> JPG)
                        const fs = require('fs')
                        const crypto = require('crypto')
                        const ffmpeg = require('fluent-ffmpeg')
                        const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path
                        ffmpeg.setFfmpegPath(ffmpegPath)

                        const randomName = crypto.randomBytes(6).toString('hex')
                        const tempInput = `./temp_stiker_${randomName}.webp`
                        const tempOutput = `./temp_foto_${randomName}.jpg`
                        fs.writeFileSync(tempInput, buffer)

                        ffmpeg(tempInput)
                            .save(tempOutput)
                            .on('end', async () => {
                                // 4. Kirim hasilnya sebagai foto
                                await conn.sendMessage(from, { 
                                    image: { url: tempOutput }, 
                                    caption: 'Nih Bos, foto aslinya udah ketemu! 😎' 
                                }, { quoted: msg })

                                // 5. Bersihin sampah file
                                fs.unlinkSync(tempInput)
                                fs.unlinkSync(tempOutput)
                            })
                            .on('error', (err) => {
                                console.log(err)
                                conn.sendMessage(from, { text: 'Gagal konversi stiker nih Bos!' })
                            })

                    } catch (err) {
                        console.log("Error ToImage:", err)
                        await conn.sendMessage(from, { text: 'Ada masalah pas ngebongkar stikernya!' })
                    }
                    break
                
                case '.del':
                case '.delete':
                    // Cek apakah lo nge-reply pesan yang mau dihapus
                    if (!msg.message.extendedTextMessage?.contextInfo?.quotedMessage) return conn.sendMessage(from, { text: 'Reply pesan yang mau dihapus, Bos!' })
                    
                    const key = {
                        remoteJid: from,
                        fromMe: msg.message.extendedTextMessage.contextInfo.participant === conn.user.id ? true : false,
                        id: msg.message.extendedTextMessage.contextInfo.stanzaId,
                        participant: msg.message.extendedTextMessage.contextInfo.participant
                    }
                    
                    await conn.sendMessage(from, { delete: key })
                    break

               // --- FITUR ADMIN (KICK, PROMOTE, DEMOTE) ---
                case '.kick':
                case '.promote':
                case '.demote':
                    if (!from.endsWith('@g.us')) return conn.sendMessage(from, { text: 'Cuma bisa di grup Bos!' })
                    
                    // Cek apakah yang nge-command itu admin
                    const groupMetadata2 = await conn.groupMetadata(from)
                    const participants2 = groupMetadata2.participants
                    const sender = msg.key.participant || msg.key.remoteJid
                    const isAdmin = participants2.find(p => p.id === sender)?.admin !== null
                    
                    if (!isAdmin) return conn.sendMessage(from, { text: 'Cuma Admin yang bisa perintah Haruna, Bos!' })

                    // Ambil target (dari reply atau mention)
                    let target = msg.message.extendedTextMessage?.contextInfo?.participant || msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
                    if (!target) return conn.sendMessage(from, { text: 'Reply atau tag orang yang mau dieksekusi Bos!' })

                    if (command === '.kick') {
                        await conn.groupParticipantsUpdate(from, [target], 'remove')
                        await conn.sendMessage(from, { text: 'Siap! Target sudah Haruna tendang dari grup. 🫡' })
                    } else if (command === '.promote') {
                        await conn.groupParticipantsUpdate(from, [target], 'promote')
                        await conn.sendMessage(from, { text: 'Selamat! Sekarang dia sudah jadi Admin. 👑' })
                    } else if (command === '.demote') {
                        await conn.groupParticipantsUpdate(from, [target], 'demote')
                        await conn.sendMessage(from, { text: 'Jabatan dicopot! Sekarang dia jadi rakyat biasa. 📉' })
                    }
                    break

                // --- FITUR FUN JODOH ---
                case '.jodoh':
                case '.couple':
                    if (!from.endsWith('@g.us')) return conn.sendMessage(from, { text: 'Cuma bisa di grup Bos!' })
                    
                    try {
                        const groupMetadata3 = await conn.groupMetadata(from)
                        const participants3 = groupMetadata3.participants
                        
                        // Acak dua orang yang berbeda
                        const jodoh1 = participants3[Math.floor(Math.random() * participants3.length)].id
                        let jodoh2 = participants3[Math.floor(Math.random() * participants3.length)].id
                        
                        // Biar nggak sama orangnya
                        while (jodoh1 === jodoh2) {
                            jodoh2 = participants3[Math.floor(Math.random() * participants3.length)].id
                        }

                        const teksJodoh = `*💘 RAMALAN JODOH HARI INI 💘*\n\nCiee... Haruna ngeramal kalau hari ini yang paling cocok adalah:\n\n@${jodoh1.split('@')[0]} ❤️ @${jodoh2.split('@')[0]}\n\n_Semoga langgeng ya! Uhuy..._ 🤣`
                        
                        await conn.sendMessage(from, { 
                            text: teksJodoh, 
                            mentions: [jodoh1, jodoh2] 
                        }, { quoted: msg })

                    } catch (err) {
                        console.log(err)
                        await conn.sendMessage(from, { text: 'Aduh, ramalan Haruna lagi burem Bos!' })
                    }
                    break
            }
        } catch (e) { console.log(e.message) }
    })

    conn.ev.on('connection.update', (up) => {
        const { connection, qr } = up
        if(qr) qrcode.generate(qr, { small: true })
        if(connection === 'open') console.log("\n[ SYSTEM ] HARUNA GEMINI EDITION ONLINE! ✅\n")
        if(connection === 'close') startBot()
    })
}
startBot()

// Taruh di sini, Bay:
const http = require('http')
http.createServer((req, res) => {
    res.write('Haruna Bot is running!')
    res.end()
}).listen(process.env.PORT || 8080)
