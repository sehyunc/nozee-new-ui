import { bytesToBigInt, fromHex, toCircomBigIntBytes } from "./binaryFormat"
import {
  HEADSPACE_PUBKEY,
  MAX_HEADER_PADDED_BYTES,
  OPENAI_PUBKEY,
} from "./constants"
import { Hash } from "./fast-sha256"
import { shaHash } from "./shaHash"

const pki = require("node-forge").pki

export async function generate_inputs(
  signature: string,
  msg: string,
  ethAddress: string,
  key: string
): Promise<any> {
  const sig = BigInt("0x" + Buffer.from(signature, "base64").toString("hex"))
  const message = Buffer.from(msg)
  const period_idx_num = BigInt(msg.indexOf("."))

  const { domain: domainStr, domain_idx: domain_index } = findDomain(msg)
  const domain = Buffer.from(domainStr ?? "")
  const domain_idx_num = BigInt(domain_index ?? 0)

  const { timestamp: timeStr, time_index: timestamp_idx } =
    findTimestampInJSON(msg)
  // generate timestamp instead of finding it in the json
  // const timestamp = BigInt(timeStr)

  const now = new Date()
  const utcMilllisecondsSinceEpoch = now.getTime()
  const timestamp = Math.round(utcMilllisecondsSinceEpoch / 1000)
  const timestamp_idx_num = BigInt(timestamp_idx ?? 0)

  const circuitType = CircuitType.JWT
  const OPENAI_PUBKEY = `-----BEGIN PUBLIC KEY-----
  MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA27rOErDOPvPc3mOADYtQ
  BeenQm5NS5VHVaoO/Zmgsf1M0Wa/2WgLm9jX65Ru/K8Az2f4MOdpBxxLL686ZS+K
  7eJC/oOnrxCRzFYBqQbYo+JMeqNkrCn34yed4XkX4ttoHi7MwCEpVfb05Qf/ZAmN
  I1XjecFYTyZQFrd9LjkX6lr05zY6aM/+MCBNeBWp35pLLKhiq9AieB1wbDPcGnqx
  lXuU/bLgIyqUltqLkr9JHsf/2T4VrXXNyNeQyBq5wjYlRkpBQDDDNOcdGpx1buRr
  Z2hFyYuXDRrMcR6BQGC0ur9hI5obRYlchDFhlb0ElsJ2bshDDGRk5k3doHqbhj2I
  gQIDAQAB
  -----END PUBLIC KEY-----`
  const HEADSPACE_PUBKEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA14yuGbqZ7adQ05MSgDxG
Z1xcl+qHhJ16corRoIVxesIdomcPhNd/Wwkn46UciBQTopZGiXQ27jaEd+vXl0rw
p6NCMByzUR5nH1P5f5IDaHaZKMH94cGHDPRWpUQdH6JrbOSyp2RcPwLIgiL0GwDv
ZI5se2gJdCR6Zt4Eq5fPdQM7yNeNWamPDLPo9TCroAu16HxQUq7zojVFjZ2wJjcr
35Ml+gLOJIm9rg1xVI9X13dmu5MwvWJQYSp4qoOvQumXr2LyYLYdi81p9lwtKAVb
IljzX6VziAph/2ekfERHLAJK2f58DfZlnyTAQ7VgrL48jYKrPwTauhzgc8+1zyw5
pwIDAQAB
-----END PUBLIC KEY-----
`
  let currentKey: string
  switch (key) {
    case "openai":
      currentKey = OPENAI_PUBKEY
      break
    case "headspace":
      currentKey = HEADSPACE_PUBKEY
    default:
      currentKey = ""
      break
  }
  const pubKeyData = pki.publicKeyFromPem(
    key === "headspace" ? HEADSPACE_PUBKEY : OPENAI_PUBKEY
  )

  const modulus = BigInt(pubKeyData.n.toString())
  const fin_result = await getCircuitInputs(
    sig,
    modulus,
    message,
    ethAddress,
    circuitType,
    period_idx_num,
    domain_idx_num,
    domain,
    timestamp,
    timestamp_idx_num
  )

  return fin_result.circuitInputs
}

export interface ICircuitInputs {
  message?: string[]
  modulus?: string[]
  signature?: string[]
  address?: string
  address_plus_one?: string
  message_padded_bytes?: string
  period_idx?: string
  domain_idx?: string
  domain?: string[]
  timestamp?: string
  timestamp_idx?: string
}
enum CircuitType {
  RSA = "rsa",
  SHA = "sha",
  TEST = "test",
  JWT = "jwt",
}

function assert(cond: boolean, errorMessage: string) {
  if (!cond) {
    throw new Error(errorMessage)
  }
}

// Works only on 32 bit sha text lengths
function int32toBytes(num: number): Uint8Array {
  const arr = new ArrayBuffer(4) // an Int32 takes 4 bytes
  const view = new DataView(arr)
  view.setUint32(0, num, false) // byteOffset = 0; litteEndian = false
  return new Uint8Array(arr)
}

// Works only on 32 bit sha text lengths
function int8toBytes(num: number): Uint8Array {
  const arr = new ArrayBuffer(1) // an Int8 takes 4 bytes
  const view = new DataView(arr)
  view.setUint8(0, num) // byteOffset = 0; litteEndian = false
  return new Uint8Array(arr)
}

// converts ascii to string
function AsciiArrayToString(arr: Buffer) {
  let str = ""
  for (let i = 0; i < arr.length; i++) {
    str += String.fromCharCode(arr[i])
  }
  return str
}

// find email domain in msg
function findDomain(msg: string) {
  let domain_idx
  let domain
  var s = Buffer.from(msg, "base64")
  var json = AsciiArrayToString(s)
  const email_regex = /([-a-zA-Z._+]+)@([-a-zA-Z]+).([a-zA-Z]+)/
  const match = json.match(email_regex)
  if (match) {
    domain = match[2] // [0] = whole group, then capture groups
    let email_index = match.index
    if (email_index) domain_idx = match[0].indexOf(domain) + email_index
  }
  return { domain, domain_idx }
}

function findTimestampInJSON(msg: string) {
  var s = Buffer.from(msg, "base64")
  var json = AsciiArrayToString(s)
  let time_index = json.indexOf(`"exp":`) + 6
  let timestamp = json.substring(time_index, time_index + 10)

  time_index += 1

  return { timestamp, time_index }
}

function mergeUInt8Arrays(a1: Uint8Array, a2: Uint8Array): Uint8Array {
  // sum of individual array lengths
  var mergedArray = new Uint8Array(a1.length + a2.length)
  mergedArray.set(a1)
  mergedArray.set(a2, a1.length)
  return mergedArray
}

// Puts an end selector, a bunch of 0s, then the length, then fill the rest with 0s.
async function sha256Pad(
  prehash_prepad_m: Uint8Array,
  maxShaBytes: number
): Promise<[Uint8Array, number]> {
  const length_bits = prehash_prepad_m.length * 8 // bytes to bits
  const length_in_bytes = int32toBytes(length_bits)
  prehash_prepad_m = mergeUInt8Arrays(prehash_prepad_m, int8toBytes(2 ** 7))
  while (
    (prehash_prepad_m.length * 8 + length_in_bytes.length * 8) % 512 !==
    0
  ) {
    prehash_prepad_m = mergeUInt8Arrays(prehash_prepad_m, int8toBytes(0))
  }
  prehash_prepad_m = mergeUInt8Arrays(prehash_prepad_m, length_in_bytes)
  assert(
    (prehash_prepad_m.length * 8) % 512 === 0,
    "Padding did not compconste properly!"
  )
  const messageLen = prehash_prepad_m.length
  while (prehash_prepad_m.length < maxShaBytes) {
    prehash_prepad_m = mergeUInt8Arrays(prehash_prepad_m, int32toBytes(0))
  }
  assert(
    prehash_prepad_m.length === maxShaBytes,
    "Padding to max length did not compconste properly!"
  )

  return [prehash_prepad_m, messageLen]
}

async function Uint8ArrayToCharArray(a: Uint8Array): Promise<string[]> {
  return Array.from(a).map((x) => x.toString())
}

async function Uint8ArrayToString(a: Uint8Array): Promise<string> {
  return Array.from(a)
    .map((x) => x.toString())
    .join(";")
}

async function partialSha(
  msg: Uint8Array,
  msgLen: number
): Promise<Uint8Array> {
  const shaGadget = new Hash()
  return await shaGadget.update(msg, msgLen).cacheState()
}

export async function getCircuitInputs(
  rsa_signature: BigInt,
  rsa_modulus: BigInt,
  msg: Buffer,
  eth_address: string,
  circuit: CircuitType,
  period_idx_num: BigInt,
  domain_idx_num: BigInt,
  domain_raw: Buffer,
  // timestamp: BigInt,
  timestamp: number,
  timestamp_idx_num: BigInt
): Promise<{
  valid: {
    validSignatureFormat?: boolean
    validMessage?: boolean
  }
  circuitInputs: ICircuitInputs
}> {
  console.log("Starting processing of inputs")
  const modulusBigInt = rsa_modulus
  // Message is the header + payload
  const prehash_message_string = msg
  const signatureBigInt = rsa_signature

  // Perform conversions
  const prehashBytesUnpadded =
    typeof prehash_message_string == "string"
      ? new TextEncoder().encode(prehash_message_string)
      : Uint8Array.from(prehash_message_string)

  // Sha add padding
  const [messagePadded, messagePaddedLen] = await sha256Pad(
    prehashBytesUnpadded,
    MAX_HEADER_PADDED_BYTES
  )

  // domain padding
  const domainUnpadded =
    typeof domain_raw == "string"
      ? new TextEncoder().encode(domain_raw)
      : Uint8Array.from(domain_raw)

  const zerosPadArray = new Uint8Array(30 - domainUnpadded.length)
  const domainPadded = new Uint8Array([...domainUnpadded, ...zerosPadArray])

  // Ensure SHA manual unpadded is running the correct function
  const shaOut = await partialSha(messagePadded, messagePaddedLen)
  assert(
    (await Uint8ArrayToString(shaOut)) ===
      (await Uint8ArrayToString(
        Uint8Array.from(await shaHash(prehashBytesUnpadded))
      )),
    "SHA256 calculation did not match!"
  )

  // Compute identity revealer
  const modulus = toCircomBigIntBytes(modulusBigInt)
  const signature = toCircomBigIntBytes(signatureBigInt)

  const message_padded_bytes = messagePaddedLen.toString()
  const message = await Uint8ArrayToCharArray(messagePadded) // Packed into 1 byte signals
  const domain = await Uint8ArrayToCharArray(domainPadded)
  const period_idx = period_idx_num.toString()
  const domain_idx = domain_idx_num.toString()

  const time = timestamp.toString()
  const time_idx = timestamp_idx_num.toString()

  const address = bytesToBigInt(fromHex(eth_address)).toString()
  const address_plus_one = (bytesToBigInt(fromHex(eth_address)) + 1n).toString()

  const circuitInputs = {
    message,
    modulus,
    signature,
    message_padded_bytes,
    address,
    address_plus_one,
    period_idx,
    domain_idx,
    domain,
    time,
    time_idx,
  }
  return {
    circuitInputs,
    valid: {},
  }
}
