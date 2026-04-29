require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// ================= ANSI COLORS =================
const colors = {
    reset: '\x1b[0m', bright: '\x1b[1m', dim: '\x1b[2m',
    red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
    blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m', white: '\x1b[37m', gray: '\x1b[90m'
};

// ================= ROBUST MARQUEE ENGINE =================
const MARQUEE = {
    enabled: process.argv.includes('--marquee'),
    queue: [],
    active: false,
    width: process.stdout.columns || 70,
    speed: 35 // ms per frame
};

// Hitung panjang teks TANPA kode warna ANSI
function getVisibleLength(str) {
    return str.replace(/\x1b\[[0-9;]*m/g, '').length;
}

// Antrian marquee (sequential, tidak bentrok)
async function processMarqueeQueue() {
    if (MARQUEE.queue.length === 0) {
        MARQUEE.active = false;
        return;
    }
    MARQUEE.active = true;
    const text = MARQUEE.queue.shift();
    const visLen = getVisibleLength(text);
    
    // Jika teks lebih pendek dari lebar terminal, beri padding agar bisa scroll
    const padding = ' '.repeat(MARQUEE.width);
    const full = padding + text + padding;
    const maxScroll = full.length - MARQUEE.width;
    
    for (let i = 0; i <= maxScroll; i++) {
        const visible = full.substring(i, i + MARQUEE.width);
        process.stdout.write(`\r${visible}`);
        await new Promise(r => setTimeout(r, MARQUEE.speed));
    }
    process.stdout.write('\n');
    processMarqueeQueue(); // Lanjut ke baris berikutnya
}

// Override console.log dengan aman
const origConsoleLog = console.log;
console.log = (...args) => {
    if (!MARQUEE.enabled) {
        origConsoleLog(...args);
        return;
    }
    
    const msg = args.map(a => typeof a === 'string' ? a : String(a)).join(' ');
    
    // Skip marquee untuk progress bar & line kosong agar tidak bentrok
    if (msg.trim() === '' || msg.startsWith('[') || msg.includes('█')) {
        origConsoleLog(msg);
        return;
    }
    
    MARQUEE.queue.push(msg);
    if (!MARQUEE.active) processMarqueeQueue();
};

// ================= BANNER =================
function showBanner() {
    console.clear();
    console.log(`${colors.cyan}${colors.bright}`);
    console.log(`╔═══════════════════════════════════════════════════════╗`);
    console.log(`║   ███████╗██╗     ██╗███╗   ██╗███████╗              ║`);
    console.log(`║   ██╔════╝██║     ██║████╗  ██║██╔════╝              ║`);
    console.log(`║   █████╗  ██║     ██║██╔██╗ ██║█████╗                ║`);
    console.log(`║   ██╔══╝  ██║     ██║██║╚██╗██║██╔══╝                ║`);
    console.log(`║   ███████╗███████╗██║██║ ╚████║███████╗              ║`);
    console.log(`║   ╚══════╝══════╝╚═╝╚═╝  ═══╝╚══════╝              ║`);
    console.log(`║     INTERNAL TRANSFER MODE - TeQoin L2              ║`);
    console.log(`╠═══════════════════════════════════════════════════════╣`);
    console.log(`║  ${colors.yellow}Script by : fates${colors.cyan}${colors.bright}                              ║`);
    console.log(`║  ${colors.magenta}Version   : 2.3 (Fixed Marquee)${colors.cyan}${colors.bright}                  ║`);
    console.log(`╚═══════════════════════════════════════════════════════╝${colors.reset}\n`);
}

// ================= CONFIGURATION =================
const CONFIG = {
    RPC_URL: process.env.RPC_URL || 'https://rpc.teqoin.io',
    CHAIN_ID: parseInt(process.env.CHAIN_ID) || 420377,
    MAX_GAS_PRICE: ethers.utils.parseUnits(process.env.MAX_GAS_PRICE_GWEI || '0.001', 'gwei'),
    MIN_RESERVE: ethers.utils.parseEther(process.env.MIN_RESERVE_PER_WALLET || '0.0001'),
    DEFAULT_BATCH_SIZE: parseInt(process.env.DEFAULT_BATCH_SIZE) || 50,
    DEFAULT_DELAY_BATCH: parseInt(process.env.DEFAULT_DELAY_BATCH) || 200,
    MAX_RETRIES: parseInt(process.env.MAX_RETRIES) || 3,
    RETRY_DELAY: 2000,
    AVG_TX_TIME_MS: 600,
    WALLETS_FILE: path.join(__dirname, 'wallets.json')
};

// ================= HELPERS =================
function parseArgs() {
    const args = process.argv.slice(2);
    const p = { amount: null, count: null, wallets: null, test: false, batchSize: null, noDelay: false, marquee: false };
    for(let i=0; i<args.length; i++) {
        if((args[i]==='-a'||args[i]==='--amount') && args[i+1]) p.amount = args[++i];
        if((args[i]==='-c'||args[i]==='--count') && args[i+1]) p.count = parseInt(args[++i]);
        if((args[i]==='-w'||args[i]==='--wallets') && args[i+1]) p.wallets = args[++i];
        if((args[i]==='-b'||args[i]==='--batch') && args[i+1]) p.batchSize = parseInt(args[++i]);
        if(args[i]==='-t'||args[i]==='--test') p.test = true;
        if(args[i]==='--no-delay') p.noDelay = true;
        if(args[i]==='--marquee') p.marquee = true;
    }
    return p;
}

function printSeparator() { console.log(`${colors.dim}─────────────────────────────────────────────────────────${colors.reset}`); }

function formatDuration(ms) {
    if (ms < 1000) return `${Math.ceil(ms/100)}s`;
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

// ================= WALLET MANAGER CLASS =================
class WalletManager {
    constructor(privateKey, name, provider) {
        this.name = name || privateKey.substring(0, 10) + '...';
        this.wallet = new ethers.Wallet(privateKey, provider);
        this.provider = provider;
        this.nonceBase = null;
        this.nonceUsed = 0;
        this.balance = null;
        this.active = true;
        this.stats = { sent: 0, received: 0, failed: 0, totalGas: ethers.BigNumber.from(0) };
    }
    
    async init() {
        try {
            this.balance = await this.provider.getBalance(this.wallet.address);
            this.nonceBase = await this.provider.getTransactionCount(this.wallet.address, 'pending');
            this.nonceUsed = 0;
            console.log(`${colors.dim}   ✅ ${this.name}: ${ethers.utils.formatEther(this.balance)} ETH | Nonce: ${this.nonceBase}${colors.reset}`);
            return true;
        } catch (err) {
            console.log(`${colors.red}   ❌ ${this.name}: ${err.message}${colors.reset}`);
            this.active = false;
            return false;
        }
    }
    
    getNextNonce() { return this.nonceBase + (this.nonceUsed++); }
    
    async refreshNonce() {
        const current = await this.provider.getTransactionCount(this.wallet.address, 'pending');
        if (current > this.nonceBase + this.nonceUsed) {
            this.nonceBase = current;
            this.nonceUsed = 0;
        }
    }
    
    canSend(amountInWei, gasEstimate) {
        const required = amountInWei.add(gasEstimate).add(CONFIG.MIN_RESERVE);
        return this.balance && this.balance.gte(required);
    }
    
    deductBalance(amountInWei, gasUsed, gasPrice) {
        if (this.balance) this.balance = this.balance.sub(amountInWei).sub(gasUsed.mul(gasPrice));
    }
    
    recordSuccess(gasUsed, gasPrice) {
        this.stats.sent++;
        this.stats.totalGas = this.stats.totalGas.add(gasUsed.mul(gasPrice));
    }
    recordFailed() { this.stats.failed++; }
    recordReceived() { this.stats.received++; }
}

// ================= MULTI-WALLET PROGRESS =================
let startTime = Date.now();
let lastProgressUpdate = 0;

function printMultiProgress(totalTx, completed, allWallets, batchSize, noDelay) {
    const percentage = Math.floor((completed / totalTx) * 100);
    const filled = Math.floor((percentage / 100) * 40);
    const bar = '█'.repeat(filled) + '░'.repeat(40 - filled);
    
    const elapsed = (Date.now() - startTime) / 1000;
    const speed = elapsed > 0 ? (completed / elapsed).toFixed(1) : '0.0';
    const totalSent = allWallets.reduce((sum, w) => sum + w.stats.sent, 0);
    const totalFailed = allWallets.reduce((sum, w) => sum + w.stats.failed, 0);
    
    const remaining = totalTx - completed;
    const etaMs = speed > 0 ? (remaining / parseFloat(speed)) * 1000 : 0;
    const eta = formatDuration(etaMs);
    
    const progressLine = `${colors.cyan}[${bar}] ${percentage}%${colors.reset} ` +
                        `${colors.white}${completed}/${totalTx}${colors.reset} ` +
                        `${colors.green}✓${totalSent}${colors.reset}/${colors.red}${totalFailed}${colors.reset} ` +
                        `${colors.dim}ETA: ${colors.cyan}${eta}${colors.dim} • ${speed} tx/s${colors.reset}`;
    
    if (Date.now() - lastProgressUpdate > 300 || completed === totalTx) {
        process.stdout.write(`\r${progressLine}`);
        lastProgressUpdate = Date.now();
    }
    if (completed === totalTx) console.log();
}

// ================= SEND WITH RETRY =================
async function sendWithRetry(walletManager, txParams, amountInWei, receiverWallet) {
    for (let attempt = 1; attempt <= CONFIG.MAX_RETRIES; attempt++) {
        try {
            const tx = await walletManager.wallet.sendTransaction(txParams);
            const receipt = await tx.wait();
            
            walletManager.deductBalance(amountInWei, receipt.gasUsed, txParams.gasPrice);
            walletManager.recordSuccess(receipt.gasUsed, txParams.gasPrice);
            if (receiverWallet) receiverWallet.recordReceived();
            
            return { success: true, hash: tx.hash, gasUsed: receipt.gasUsed };
        } catch (err) {
            if (err.message?.includes('nonce') || err.code === 'NONCE_EXPIRED') {
                await walletManager.refreshNonce();
                txParams.nonce = walletManager.getNextNonce();
                if (attempt === CONFIG.MAX_RETRIES) throw err;
                await new Promise(r => setTimeout(r, CONFIG.RETRY_DELAY));
            } else if (err.message?.includes('insufficient funds')) {
                walletManager.active = false;
                throw err;
            } else {
                throw err;
            }
        }
    }
}

// ================= INTERNAL TRANSFER CORE =================
async function executeInternalTransfer(amount, totalTx, walletConfigs, batchSize, noDelay) {
    startTime = Date.now();
    lastProgressUpdate = 0;
    
    printSeparator();
    console.log(`${colors.green}${colors.bright}🔄 INTERNAL TRANSFER MODE: ${totalTx} TRANSACTIONS${colors.reset}`);
    printSeparator();
    
    const provider = new ethers.providers.JsonRpcProvider(CONFIG.RPC_URL, CONFIG.CHAIN_ID);
    
    console.log(`${colors.yellow}🔐 Initializing wallets...${colors.reset}`);
    const wallets = [];
    for (const cfg of walletConfigs) {
        const wm = new WalletManager(cfg.privateKey, cfg.name, provider);
        if (await wm.init()) wallets.push(wm);
    }
    
    const activeWallets = wallets.filter(w => w.active);
    if (activeWallets.length === 0) {
        console.log(`${colors.red}${colors.bright}\n❌ No active wallets!${colors.reset}\n`);
        return;
    }
    console.log(`${colors.green}✅ ${activeWallets.length}/${walletConfigs.length} wallets ready${colors.reset}`);
    
    const amountInWei = ethers.utils.parseEther(amount.toString());
    const currentGasPrice = await provider.getGasPrice();
    const actualGasPrice = currentGasPrice.gt(CONFIG.MAX_GAS_PRICE) ? CONFIG.MAX_GAS_PRICE : currentGasPrice;
    const gasPerTx = ethers.BigNumber.from(21000);
    
    const totalSend = amountInWei.mul(totalTx);
    const estGas = gasPerTx.mul(totalTx).mul(actualGasPrice);
    const totalEstimate = totalSend.add(estGas);
    
    console.log(`${colors.yellow}📊 Estimasi Gabungan:${colors.reset}`);
    console.log(`   Total ETH dikirim: ${colors.cyan}${ethers.utils.formatEther(totalSend)} ETH${colors.reset}`);
    console.log(`   Estimasi gas:      ${colors.cyan}${ethers.utils.formatEther(estGas)} ETH${colors.reset}`);
    console.log(`   Total diperlukan:  ${colors.magenta}${ethers.utils.formatEther(totalEstimate)} ETH${colors.reset}`);
    
    const totalBalance = activeWallets.reduce((sum, w) => sum.add(w.balance), ethers.BigNumber.from(0));
    if (totalBalance.lt(totalEstimate)) {
        console.log(`${colors.red}${colors.bright}\n❌ Total saldo tidak cukup!${colors.reset}`);
        console.log(`${colors.dim}   Total saldo: ${ethers.utils.formatEther(totalBalance)} ETH${colors.reset}`);
        return;
    }
    printSeparator();
    
    const poolAddresses = activeWallets.map(w => w.wallet.address);
    const txPairs = [];
    
    if (activeWallets.length === 1) {
        console.log(`${colors.yellow}⚠️  Hanya 1 wallet aktif. Semua tx akan menjadi self-transfer (looping).${colors.reset}`);
    }
    
    for (let i = 0; i < totalTx; i++) {
        const sender = activeWallets[i % activeWallets.length];
        const others = poolAddresses.filter(addr => addr !== sender.wallet.address);
        const receiver = others.length > 0 
            ? others[Math.floor(Math.random() * others.length)] 
            : sender.wallet.address;
            
        txPairs.push({ sender, receiver });
    }
    
    let completed = 0;
    console.log(`${colors.bright}\n🔄 Memulai internal transfer...${colors.reset}\n`);
    
    for (let batchStart = 0; batchStart < totalTx; batchStart += batchSize) {
        const batchEnd = Math.min(batchStart + batchSize, totalTx);
        const batchPromises = [];
        
        for (let i = batchStart; i < batchEnd; i++) {
            const { sender, receiver } = txPairs[i];
            
            if (!sender.active || !sender.canSend(amountInWei, gasPerTx.mul(actualGasPrice))) {
                completed++;
                printMultiProgress(totalTx, completed, activeWallets, batchSize, noDelay);
                continue;
            }
            
            const nonce = sender.getNextNonce();
            const receiverWallet = activeWallets.find(w => w.wallet.address === receiver);
            
            const promise = (async () => {
                try {
                    const txParams = {
                        to: receiver,
                        value: amountInWei,
                        gasLimit: gasPerTx,
                        gasPrice: actualGasPrice,
                        nonce
                    };
                    const result = await sendWithRetry(sender, txParams, amountInWei, receiverWallet);
                    return { success: true, from: sender.name, to: receiver.substring(0,10)+'...' };
                } catch (err) {
                    sender.recordFailed();
                    return { success: false, from: sender.name, error: err.message?.substring(0, 60) };
                }
            })();
            batchPromises.push(promise);
        }
        
        await Promise.all(batchPromises);
        completed = batchEnd;
        printMultiProgress(totalTx, completed, activeWallets, batchSize, noDelay);
        
        if (batchEnd < totalTx && !noDelay) {
            await new Promise(r => setTimeout(r, CONFIG.DEFAULT_DELAY_BATCH));
        }
    }
    
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
    const avgSpeed = (totalTx / parseFloat(totalTime)).toFixed(2);
    const totalSent = activeWallets.reduce((sum, w) => sum + w.stats.sent, 0);
    const totalFailed = activeWallets.reduce((sum, w) => sum + w.stats.failed, 0);
    const totalReceived = activeWallets.reduce((sum, w) => sum + w.stats.received, 0);
    
    console.log(`\n\n${colors.bright}${colors.cyan}╔═══════════════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}║               INTERNAL TRANSFER REPORT                ║${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}╠═══════════════════════════════════════════════════════╣${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}║${colors.reset}  ${colors.green}✅ Total Sukses:${colors.reset} ${String(totalSent).padStart(4, ' ')} / ${totalTx} transactions    ${colors.bright}${colors.cyan}║${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}║${colors.reset}  ${colors.red}❌ Total Gagal:${colors.reset} ${String(totalFailed).padStart(4, ' ')} / ${totalTx} transactions    ${colors.bright}${colors.cyan}║${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}║${colors.reset}  ${colors.yellow}💰 Volume Sent:${colors.reset} ${ethers.utils.formatEther(amountInWei.mul(totalSent))} ETH               ${colors.bright}${colors.cyan}║${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}║${colors.reset}  ${colors.magenta} Volume Recv:${colors.reset} ${ethers.utils.formatEther(amountInWei.mul(totalReceived))} ETH               ${colors.bright}${colors.cyan}║${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}║${colors.reset}  ${colors.cyan}⚡ Success Rate:${colors.reset} ${((totalSent/totalTx)*100).toFixed(2)}%                    ${colors.bright}${colors.cyan}║${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}║${colors.reset}  ${colors.white}⏱️  Total Time:${colors.reset} ${formatDuration(parseFloat(totalTime) * 1000)} (${avgSpeed} tx/s)        ${colors.bright}${colors.cyan}║${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}╚═══════════════════════════════════════════════════════╝${colors.reset}\n`);
    
    console.log(`${colors.dim} Per-Wallet Statistics:${colors.reset}`);
    activeWallets.forEach((w, idx) => {
        console.log(`   ${idx+1}. ${w.name.padEnd(12)} Sent: ${colors.green}${w.stats.sent}${colors.reset} | Recv: ${colors.cyan}${w.stats.received}${colors.reset} | Fail: ${colors.red}${w.stats.failed}${colors.reset} | Balance: ${ethers.utils.formatEther(w.balance)} ETH`);
    });
    
    console.log(`\n${colors.green}${colors.bright}🏁 INTERNAL TRANSFER COMPLETE!${colors.reset}\n`);
}

// ================= LOAD WALLETS =================
function loadWallets(customPath) {
    const walletPath = customPath || CONFIG.WALLETS_FILE;
    if (!fs.existsSync(walletPath)) {
        console.error(`${colors.red}❌ Wallets file not found: ${walletPath}${colors.reset}`);
        console.error(`${colors.dim}   Buat file wallets.json dengan daftar private key${colors.reset}\n`);
        process.exit(1);
    }
    try {
        const data = JSON.parse(fs.readFileSync(walletPath, 'utf8'));
        if (!data.wallets || !Array.isArray(data.wallets) || data.wallets.length === 0) throw new Error('Invalid format');
        return data;
    } catch (err) {
        console.error(`${colors.red}❌ Error loading wallets: ${err.message}${colors.reset}\n`);
        process.exit(1);
    }
}

// ================= ENTRY =================
async function main() {
    showBanner();
    const args = parseArgs();
    
    // Aktifkan marquee jika flag diberikan
    if (args.marquee) MARQUEE.enabled = true;
    
    printSeparator();
    console.log(`${colors.yellow}⚙️  KONFIGURASI:${colors.reset}`);
    console.log(`   RPC: ${colors.cyan}${CONFIG.RPC_URL}${colors.reset}`);
    console.log(`   Chain ID: ${colors.cyan}${CONFIG.CHAIN_ID}${colors.reset}`);
    console.log(`   Max Gas: ${colors.cyan}${process.env.MAX_GAS_PRICE_GWEI || '0.001'} Gwei${colors.reset}`);
    printSeparator();
    
    if (args.test) {
        console.log(`${colors.magenta}${colors.bright}🧪 MODE TEST${colors.reset}\n`);
        const testWallets = { wallets: [
            { name: 'W1', privateKey: process.env.PRIVATE_KEY },
            { name: 'W2', privateKey: process.env.PRIVATE_KEY }
        ]};
        await executeInternalTransfer('0.000001', 6, testWallets.wallets, 3, true);
        return;
    }
    
    const walletData = loadWallets(args.wallets);
    const amt = args.amount || process.env.DEFAULT_AMOUNT || '0.000001';
    const cnt = args.count || 500;
    const batchSize = args.batchSize || CONFIG.DEFAULT_BATCH_SIZE;
    const noDelay = args.noDelay || false;
    
    const estTime = (cnt * CONFIG.AVG_TX_TIME_MS) / walletData.wallets.length;
    
    console.log(`${colors.green}${colors.bright}📋 INTERNAL TRANSFER PARAMETERS:${colors.reset}`);
    console.log(`   🎯 Total Target:     ${colors.cyan}${cnt} transactions${colors.reset}`);
    console.log(`   💵 Amount per Tx:    ${colors.cyan}${amt} ETH${colors.reset}`);
    console.log(`   👛 Active Wallets:   ${colors.cyan}${walletData.wallets.length}${colors.reset}`);
    console.log(`   📦 Batch Size:       ${colors.cyan}${batchSize}${colors.reset}`);
    console.log(`   ⏱️  Est. Duration:   ${colors.magenta}${formatDuration(estTime)}${colors.reset} (parallel)\n`);
    
    await executeInternalTransfer(amt, cnt, walletData.wallets, batchSize, noDelay);
}

// Error handlers
process.on('uncaughtException', (err) => { console.error(`\n${colors.red}${colors.bright}💥 FATAL:${colors.reset} ${err.message}\n`); process.exit(1); });
process.on('SIGINT', () => { const elapsed = formatDuration(Date.now() - startTime); console.log(`\n${colors.yellow}⚠️  Interrupted after ${elapsed}. Exiting...${colors.reset}\n`); process.exit(0); });

main().catch(console.error);
