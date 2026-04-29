# File: .bashrc
# Tambahkan di bagian paling bawah:

# ============ TEQOIN BOT ALIASES ============
export PATH="$PATH:$(pwd)/bin"

alias bot='node bot-multi.js -c 50000 -a 0.000001'
alias bot-test='node bot-multi.js --test'
alias bot-fast='node bot-multi.js -c 50000 -a 0.000001 --no-delay'
alias bot-marquee='node bot-multi.js -c 50000 -a 0.000001 --marquee'
alias bot-status='echo "💰 Saldo:" && node -e "const {ethers}=require(\"ethers\");const p=new ethers.providers.JsonRpcProvider(\"https://rpc.teqoin.io\");p.getBalance(\"'$(grep privateKey wallets.json | head -1 | cut -d\" -f4)'\").then(b=>console.log(ethers.utils.formatEther(b),\"ETH\"))"'
# ============================================

# Di .bashrc
alias bot-help='echo -e "📋 TeQoin Bot Commands:\n  bot [count] [amount] [batch]\n  bot-test\n  bot-fast\n  bot-marquee\n  bot-status\n\n💡 Example:\n  bot 10000 0.00001 50"'
