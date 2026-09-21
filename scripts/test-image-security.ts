import assert from 'node:assert/strict'
import { isPublicAddress, validatePublicUrl } from '../src/images/prepareImage'

const publicAddresses=['8.8.8.8','2606:4700:4700::1111','::ffff:8.8.8.8']
const blockedAddresses=['127.0.0.1','10.0.0.1','172.16.0.1','192.168.1.1','169.254.1.1','0.0.0.0','224.0.0.1','255.255.255.255','::','::1','fc00::1','fe80::1','ff02::1','::ffff:127.0.0.1']
for (const address of publicAddresses) assert.equal(isPublicAddress(address),true,`expected public: ${address}`)
for (const address of blockedAddresses) assert.equal(isPublicAddress(address),false,`expected blocked: ${address}`)

await validatePublicUrl('https://8.8.8.8/image.jpg')
await assert.rejects(validatePublicUrl('http://127.0.0.1/image.jpg'),{code:'PRIVATE_IP'})
await assert.rejects(validatePublicUrl('http://[::1]/image.jpg'),{code:'PRIVATE_IP'})
await assert.rejects(validatePublicUrl('http://127.0.0.1/image.jpg',true),{code:'REDIRECT_TO_PRIVATE_IP'})
// CDN hostnames commonly resolve to both A and AAAA records; all returned addresses must be public.
await validatePublicUrl('https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js')
console.log('Image SSRF address classification verified.')
