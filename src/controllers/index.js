const Tx = require('ethereumjs-tx').Transaction
const { generateErrorResponse } = require('../helpers/generate-response')
const  { validateCaptcha } = require('../helpers/captcha-helper')
const { debug } = require('../helpers/debug')

module.exports = function (app) {
	const config = app.config
	const web3 = app.web3

	const messages = {
		INVALID_CAPTCHA: 'Invalid captcha',
		INVALID_ADDRESS: 'Invalid address',
		TX_HAS_BEEN_MINED_WITH_FALSE_STATUS: 'Transaction has been mined, but status is false',
		TX_HAS_BEEN_MINED: 'Tx has been mined',
	}

	const tokenContract = new web3.eth.Contract(config.Ethereum.Token.abi, config.Ethereum.Token.address);

	app.post('/', async function(request, response) {
	    console.log('post')
		const isDebug = app.config.debug
		debug(isDebug, "REQUEST:")
		debug(isDebug, request.body)
		const recaptureResponse = request.body["g-recaptcha-response"]
		if (!recaptureResponse) {
			const error = {
				message: messages.INVALID_CAPTCHA,
			}
			return generateErrorResponse(response, error)
		}

		let captchaResponse
		try {
			captchaResponse = await validateCaptcha(app, recaptureResponse)
		} catch(e) {
			return generateErrorResponse(response, e)
		}
		const receiver = request.body.receiver
		if (await validateCaptchaResponse(captchaResponse, receiver, response)) {
			await sendPOAToRecipient(web3, receiver, response, isDebug)
		}
	});

	app.get('/health', async function(request, response) {
		let balanceInWei
		let balanceInEth
        let srkBalanceExpanded
        let srkBalance
		const address = config.Ethereum[config.environment].account
		try {
			balanceInWei = await web3.eth.getBalance(address)
			balanceInEth = await web3.utils.fromWei(balanceInWei, "ether")
            srkBalanceExpanded = await tokenContract.methods.balanceOf(address).call()
            srkBalance = await web3.utils.fromWei(srkBalanceExpanded.toString())
		} catch (error) {
			return generateErrorResponse(response, error)
		}

		const resp = {
			address,
			balanceInWei: balanceInWei,
			balanceInEth: Math.round(balanceInEth),
			srkBalance: srkBalance
		}
		response.send(resp)
	});

	async function validateCaptchaResponse(captchaResponse, receiver, response) {
		if (!captchaResponse || !captchaResponse.success) {
			generateErrorResponse(response, {message: messages.INVALID_CAPTCHA})
			return false
		}

		return true
	}

	async function sendPOAToRecipient(web3, receiver, response, isDebug) {
	    console.log('test')
		let senderPrivateKey = config.Ethereum[config.environment].privateKey
		const privateKeyHex = Buffer.from(senderPrivateKey, 'hex')
		if (!web3.utils.isAddress(receiver)) {
			return generateErrorResponse(response, {message: messages.INVALID_ADDRESS})
		}
	    console.log('after isAddress')
	    console.log(await web3.eth.getTransactionCount(config.Ethereum[config.environment].account))
		const gasPrice = web3.utils.toWei('50', 'gwei')
		const gasPriceHex = web3.utils.toHex(gasPrice)
		const gasLimitHex = web3.utils.toHex(config.Ethereum.gasLimit)
		const nonce = await web3.eth.getTransactionCount(config.Ethereum[config.environment].account)
		const nonceHex = web3.utils.toHex(nonce)
		const BN = web3.utils.BN
		const valueToSend = web3.utils.toWei(config.Ethereum.valueToTransfer, 'ether')
		const rawTx = {
		  nonce: nonceHex,
		  gasPrice: gasPriceHex,
		  gasLimit: gasLimitHex,
		  to: config.Ethereum.Token.address,
		  data: tokenContract.methods.transfer(receiver, valueToSend).encodeABI()
		}
	    console.log('transaction preparation')

        const tx = new Tx(rawTx, {'chain':'ropsten'});
		tx.sign(privateKeyHex)
	    console.log('transaction signing')

		const serializedTx = tx.serialize()

		let txHash
		web3.eth.sendSignedTransaction("0x" + serializedTx.toString('hex'))
		.once('transactionHash', (_txHash) => {
            console.log('tx hash')
			txHash = _txHash
		})
		.once('receipt', (receipt) => {
            console.log('receipt')
			debug(isDebug, receipt)
            console.log(receipt)
            return sendRawTransactionResponse(txHash, response)
			// if (receipt.status === '0x1') {
			// } else {
			// 	const error = {
			// 		message: messages.TX_HAS_BEEN_MINED_WITH_FALSE_STATUS,
			// 	}
			// 	return generateErrorResponse(response, error);
			// }
		})
		.on('error', (error) => {
		    console.log('error sending')
            return generateErrorResponse(response, error)
		});
	}

	function sendRawTransactionResponse(txHash, response) {
		const successResponse = {
			code: 200,
			title: 'Success',
			message: messages.TX_HAS_BEEN_MINED,
			txHash: txHash
		}

	  	response.send({
	  		success: successResponse
	  	})
	}
}
