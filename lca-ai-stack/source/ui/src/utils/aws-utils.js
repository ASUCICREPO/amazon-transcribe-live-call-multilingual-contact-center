import './init';
import AWS from 'aws-sdk';

const getSignatureKey = (key, date, region, service) => {
  const kDate = AWS.util.crypto.hmac(`AWS4${key}`, date, 'buffer');
  const kRegion = AWS.util.crypto.hmac(kDate, region, 'buffer');
  const kService = AWS.util.crypto.hmac(kRegion, service, 'buffer');
  const kCredentials = AWS.util.crypto.hmac(kService, 'aws4_request', 'buffer');
  return kCredentials;
};

export const getSignedUrl = (host, path, region, credentials) => {
  const datetime = AWS.util.date.iso8601(new Date()).replace(/[:\\-]|\.\\d{3}/g, '');
  const date = datetime.substr(0, 8);

  const method = 'GET';
  const protocol = 'wss';
  const service = 'execute-api';
  const algorithm = 'AWS4-HMAC-SHA256';

  const credentialScope = `${date}/${region}/${service}/aws4_request`;
  let canonicalQuerystring = `X-Amz-Algorithm=${algorithm}`;
  canonicalQuerystring += `&X-Amz-Credential=${encodeURIComponent(
    `${credentials.accessKeyId}/${credentialScope}`,
  )}`;
  canonicalQuerystring += `&X-Amz-Date=${datetime}`;
  if (credentials.sessionToken) {
    canonicalQuerystring += `&X-Amz-Security-Token=${encodeURIComponent(credentials.sessionToken)}`;
  }
  canonicalQuerystring += '&X-Amz-SignedHeaders=host';

  const canonicalHeaders = `host:${host}\n`;
  const payloadHash = AWS.util.crypto.sha256('', 'hex');
  const canonicalRequest = `${method}
${path}
${canonicalQuerystring}
${canonicalHeaders}
host
${payloadHash}`;

  const stringToSign = `${algorithm}
${datetime}
${credentialScope}
${AWS.util.crypto.sha256(canonicalRequest, 'hex')}`;
  const signingKey = getSignatureKey(credentials.secretAccessKey, date, region, service);
  const signature = AWS.util.crypto.hmac(signingKey, stringToSign, 'hex');

  canonicalQuerystring += `&X-Amz-Signature=${signature}`;

  const requestUrl = `${protocol}://${host}${path}?${canonicalQuerystring}`;
  return requestUrl;
};

const getWebSocket = () => {
  // Return your WebSocket endpoint URL
  const endpoint = process.env.REACT_APP_WS_ENDPOINT;
  return `${endpoint}`;
};

export default getWebSocket;
