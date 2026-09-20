import { gzipSync, gunzipSync } from "node:zlib";
// OpenSpeech v3: 4-byte header, optional sequence, uint32 payload length, gzip payload.
export function encodeVolcPacket(
  payload: Buffer,
  audio = false,
  last = false,
): Buffer {
  const compressed = gzipSync(payload);
  const header = Buffer.from([
    0x11,
    audio ? (last ? 0x22 : 0x20) : 0x10,
    audio ? 0x01 : 0x11,
    0,
  ]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(compressed.length);
  return Buffer.concat([header, length, compressed]);
}
export function decodeVolcPacket(data: Buffer): {
  payload: any;
  last: boolean;
} {
  if (data.length < 8 || data[0] >> 4 !== 1)
    throw new Error("火山引擎返回无效协议帧");
  const type = data[1] >> 4,
    flags = data[1] & 15,
    serialization = data[2] >> 4,
    compression = data[2] & 15;
  let offset = (data[0] & 15) * 4;
  if (offset < 4 || offset > data.length - 4)
    throw new Error("火山引擎协议头长度无效");
  let errorCode: number | undefined;
  if (type === 15) {
    errorCode = data.readUInt32BE(offset);
    offset += 4;
  } else if (flags & 1) offset += 4;
  if (offset + 4 > data.length) throw new Error("火山引擎协议帧被截断");
  const size = data.readUInt32BE(offset);
  offset += 4;
  if (offset + size !== data.length) throw new Error("火山引擎数据长度不匹配");
  let payload = data.subarray(offset, offset + size);
  if (compression === 1)
    payload = gunzipSync(payload, { maxOutputLength: 2 * 1024 * 1024 });
  else if (compression !== 0) throw new Error("不支持的火山引擎压缩方式");
  if (errorCode !== undefined)
    throw new Error(
      `火山引擎错误 ${errorCode}，请检查凭据、资源 ID 与服务额度。`,
    );
  if (serialization !== 1) throw new Error("火山引擎返回非 JSON 数据");
  return { payload: JSON.parse(payload.toString()), last: Boolean(flags & 2) };
}
