import axios, { AxiosInstance } from 'axios'
import {
  AskForStorageResponse,
  GasEstimationResponse,
  GetMinerInfoResponse,
  GetNonceResponse,
  ListMinersResponse,
  MpoolPushOk,
  MpoolPushResponse,
  ReadStateResponse,
  RpcError,
  StateWaitMsgResponse,
  WalletBalanceResponse,
} from '../artifacts/rpc.js'
import { Network } from '../artifacts/index.js'
import { Address } from '../address/index.js'
import { Transaction } from '../transaction/index.js'
import { Signature } from '../wallet/index.js'
import { getNetworkPrefix } from '../address/utils.js'
import {
  ClientQueryAsk,
  GasEstimateMessageGas,
  MpoolGetNonce,
  MpoolPush,
  RpcVersion,
  StateListMiners,
  StateMinerInfo,
  StateReadState,
  StateWaitMsg,
  WalletBalance,
} from './constants.js'

/**
 * Parameters to create a new RPC connection
 */
type Args = { url: string; token: string; timeout?: number }

/**
 * In order to interact with a node remotely, filecoin nodes implement the rpc protocol. By this communication, there are a set of predefined actions
 * that can be executed on the node: from fetching information about accounts and miners, fetch address balance to broadcast new transactions.
 * In order to run certain actions ta require write permission, like broadcasting a new tx to the node, a token will be required.
 * For more information about the filecoin rpc, please refer to this {@link https://docs.filecoin.io/developers/reference/json-rpc/introduction|link}
 * If you want to check the full list of actions, please refer to this {@link https://lotus.filecoin.io/reference/basics/overview/|link}
 * For more information about RPC, please refer to this {@link https://en.wikipedia.org/wiki/Remote_procedure_call|link}
 */
export class RPC {
  /**
   * Http client used to communicate to the node
   */
  protected fetcher: AxiosInstance

  /**
   * Indicates which network this RPC interacts with
   */
  protected network: Network

  /**
   * Create a new RPC instance
   * @param network - indicates which network this RPC will be allowed to talk to
   * @param args - required connection parameters
   */
  constructor(network: Network, args: Args) {
    this.fetcher = axios.create({
      baseURL: args.url,
      timeout: args.timeout,
      headers: { Authorization: `Bearer ${args.token}` },
    })

    this.network = network
  }

  /**
   * Getter for network value
   */
  getNetwork = () => this.network

  /**
   * Allows to get the next address nonce, required to broadcast a new tx to the blockchain
   * For more information about MpoolGetNonce, please refer to this {@link https://lotus.filecoin.io/reference/lotus/mpool/#mpoolgetnonce|link}
   * @param address - address which next nonce to query
   * @returns the next nonce or error
   */
  async getNonce(address: Address | string): Promise<GetNonceResponse> {
    address = this.validateNetwork(address)

    try {
      const response = await this.fetcher.post('', {
        jsonrpc: RpcVersion,
        method: MpoolGetNonce,
        id: 1,
        params: [address.toString()],
      })
      return response.data as GetNonceResponse
    } catch (e: unknown) {
      return this.handleError<RpcError>(e)
    }
  }

  /**
   * Allows to send a new transaction to the blockchain
   * For more information about MpoolPush, please refer to this {@link https://lotus.filecoin.io/reference/lotus/mpool/#mpoolpush|link}
   * @param tx - transaction to be broadcast
   * @param signature - transaction signature to be broadcast
   * @returns the cid related to the tx or error
   */
  async broadcastTransaction(tx: Transaction, signature: Signature): Promise<MpoolPushResponse> {
    this.validateNetwork(tx.to, 'receiver')
    this.validateNetwork(tx.from, 'sender')

    try {
      const mpoolResponse = await this.fetcher.post('', {
        jsonrpc: RpcVersion,
        method: MpoolPush,
        id: 1,
        params: [{ Message: tx.toJSON(), Signature: signature.toJSON() }],
      })

      return mpoolResponse.data as MpoolPushResponse
    } catch (e: unknown) {
      return this.handleError<RpcError>(e)
    }
  }

  /**
   * Allows to get the proper fees values required to broadcast a new tx to the blockchain
   * For more information about how gas fees work, please refer to this {@link https://spec.filecoin.io/systems/filecoin_vm/gas_fee/#section-systems.filecoin_vm.gas_fee|link}
   * For more information about gas fees, please refer to this {@link https://lotus.filecoin.io/reference/lotus/gas/#gasestimatemessagegas|link}
   * @param tx - transaction that is intended to be broadcast
   * @returns the fees values or error
   */
  async getGasEstimation(tx: Transaction): Promise<GasEstimationResponse> {
    this.validateNetwork(tx.to, 'receiver')
    this.validateNetwork(tx.from, 'sender')

    try {
      const response = await this.fetcher.post('', {
        jsonrpc: RpcVersion,
        method: GasEstimateMessageGas,
        id: 1,
        params: [tx.toJSON(), { MaxFee: '0' }, null],
      })

      return response.data as GasEstimationResponse
    } catch (e: unknown) {
      return this.handleError<RpcError>(e)
    }
  }

  /**
   * Returns the indicated actor’s state.
   * For more information about read state, please refer to this {@link https://lotus.filecoin.io/reference/lotus/state/#statereadstate|link}
   * @param address - address to read state
   * @returns the state or error
   */
  async readState(address: Address | string): Promise<ReadStateResponse> {
    address = this.validateNetwork(address)

    try {
      const response = await this.fetcher.post('', {
        jsonrpc: RpcVersion,
        method: StateReadState,
        id: 1,
        params: [address.toString(), null],
      })

      return response.data as ReadStateResponse
    } catch (e: unknown) {
      return this.handleError<RpcError>(e)
    }
  }

  /**
   * Allows to look back in the chain for a message. If not found, it blocks until the message arrives at chain, and gets to the indicated confidence depth.
   * For more information about waitMsgState, please refer to this {@link https://lotus.filecoin.io/reference/lotus/state/#statewaitmsg|link}
   * @param cid - transaction cid to wait
   * @param confidence - guarantees that the message has been on chain for at least confidence epochs without being reverted before returning.
   * @param lookBackLimit - limit to how many epochs it will search backward
   * @returns the transaction state or error
   */
  async waitMsgState(cid: MpoolPushOk['result'], confidence: number, lookBackLimit: number): Promise<StateWaitMsgResponse> {
    try {
      const response = await this.fetcher.post('', {
        jsonrpc: RpcVersion,
        method: StateWaitMsg,
        id: 1,
        params: [cid, confidence, lookBackLimit, false],
      })
      return response.data as StateWaitMsgResponse
    } catch (e: unknown) {
      return this.handleError<RpcError>(e)
    }
  }

  /**
   * Returns the balance of the given address at the current head of the chain.
   * For more information about walletBalance, please refer to this {@link https://lotus.filecoin.io/reference/lotus/wallet/#walletbalance|link}
   * @param address - address to fetch balance from
   * @returns the actual balance or error
   */
  async walletBalance(address: Address): Promise<WalletBalanceResponse> {
    address = this.validateNetwork(address)

    try {
      const response = await this.fetcher.post('', {
        jsonrpc: RpcVersion,
        method: WalletBalance,
        id: 1,
        params: [address.toString()],
      })
      return response.data as WalletBalanceResponse
    } catch (e: unknown) {
      return this.handleError<RpcError>(e)
    }
  }

  /**
   * Handle errors coming from the fetcher (axios) instance
   * For more information about error handling, please refer to this {@link https://axios-http.com/docs/handling_errors|link}
   * @returns a specific formatted error
   */
  async listMiners(): Promise<ListMinersResponse> {
    try {
      const response = await this.fetcher.post('', {
        jsonrpc: RpcVersion,
        method: StateListMiners,
        id: 1,
        params: [null],
      })

      return response.data as ListMinersResponse
    } catch (e: unknown) {
      return this.handleError<RpcError>(e)
    }
  }

  async getMinerInfo(minerAddr: Address | string): Promise<GetMinerInfoResponse> {
    minerAddr = this.validateNetwork(minerAddr)

    try {
      const response = await this.fetcher.post('', {
        jsonrpc: RpcVersion,
        method: StateMinerInfo,
        id: 1,
        params: [minerAddr.toString(), null],
      })

      return response.data as GetMinerInfoResponse
    } catch (e: unknown) {
      return this.handleError<RpcError>(e)
    }
  }

  async askForStorage(minerAddr: Address | string, peerId: string): Promise<AskForStorageResponse> {
    minerAddr = this.validateNetwork(minerAddr)

    try {
      const response = await this.fetcher.post('', {
        jsonrpc: RpcVersion,
        method: ClientQueryAsk,
        id: 1,
        params: [peerId, minerAddr.toString()],
      })

      return response.data as AskForStorageResponse
    } catch (e: unknown) {
      return this.handleError<RpcError>(e)
    }
  }

  private handleError<T>(e: unknown): T {
    if (axios.isAxiosError(e)) {
      if (e.response) {
        if (e.response.data) return e.response.data as T
        if (e.response.statusText) return { error: { message: `${e.response.status} - ${e.response.statusText}` } } as T
      }
      if (e.request) return { error: { message: 'request made but no response received' } } as T
      if (e.message) return { error: { message: e.message } } as T
    }
    throw e
  }

  private validateNetwork = (address: Address | string, description = 'address'): Address => {
    const networkPrefix = getNetworkPrefix(this.network)

    if (typeof address == 'string') address = Address.fromString(address)
    if (address.getNetworkPrefix() !== networkPrefix)
      throw new Error(`${description} belongs to ${address.getNetworkPrefix()} network while rpc allows ${networkPrefix}`)

    return address
  }
}

/**
 * Filecoin RPC connection preloaded to interact with mainnet network
 */
export class MainnetRPC extends RPC {
  constructor(args: Args) {
    super(Network.Mainnet, args)
  }
}

/**
 * Filecoin RPC connection preloaded to interact with calibration network
 */
export class CalibrationRPC extends RPC {
  constructor(args: Args) {
    super(Network.Calibration, args)
  }
}

/**
 * Filecoin RPC connection preloaded to interact with butterfly network
 */
export class ButterflyRPC extends RPC {
  constructor(args: Args) {
    super(Network.Butterfly, args)
  }
}

/**
 * Filecoin RPC connection preloaded to interact with hyperspace network
 */
export class HyperspaceRPC extends RPC {
  constructor(args: Args) {
    super(Network.Hyperspace, args)
  }
}
