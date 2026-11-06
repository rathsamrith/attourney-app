import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpFaceMatch, HttpTimestampAuthority, KeySigner, RemoteFileStorage, X509CertificateValidator } from './adapters.js';
import {
  FakeCertificateValidator,
  FakeFaceMatch,
  FakeSigner,
  FakeTimestampAuthority,
  LocalFileStorage,
} from './fakes.js';
import { CERTIFICATE_VALIDATOR, FACE_MATCH, FILE_STORAGE, SIGNER, TIMESTAMP_AUTHORITY } from './providers.js';

/**
 * Each provider uses the production adapter when its environment variable is configured,
 * and the development fake otherwise. Dev and tests set none of these, so they keep the fakes.
 */
@Global()
@Module({
  providers: [
    {
      provide: FACE_MATCH,
      inject: [ConfigService],
      useFactory: (c: ConfigService) => {
        const url = c.get<string>('FACE_MATCH_URL');
        return url ? new HttpFaceMatch(url, c.get<string>('FACE_MATCH_API_KEY')) : new FakeFaceMatch();
      },
    },
    {
      provide: CERTIFICATE_VALIDATOR,
      inject: [ConfigService],
      useFactory: (c: ConfigService) => {
        const ca = c.get<string>('CERT_CA_BUNDLE_PEM');
        return ca || c.get('CERT_VALIDATION') === 'real'
          ? new X509CertificateValidator(ca)
          : new FakeCertificateValidator();
      },
    },
    {
      provide: SIGNER,
      inject: [ConfigService],
      useFactory: (c: ConfigService) => {
        const key = c.get<string>('SIGNING_PRIVATE_KEY_PEM');
        return key ? new KeySigner(key, c.get<string>('SIGNING_PUBLIC_KEY_PEM')) : new FakeSigner();
      },
    },
    {
      provide: TIMESTAMP_AUTHORITY,
      inject: [ConfigService],
      useFactory: (c: ConfigService) => {
        const url = c.get<string>('TSA_URL');
        return url ? new HttpTimestampAuthority(url) : new FakeTimestampAuthority();
      },
    },
    {
      provide: FILE_STORAGE,
      inject: [ConfigService],
      useFactory: (c: ConfigService) => {
        const url = c.get<string>('FILE_STORAGE_URL');
        return url ? new RemoteFileStorage(url, c.get<string>('FILE_STORAGE_TOKEN')) : new LocalFileStorage(c);
      },
    },
  ],
  exports: [FACE_MATCH, CERTIFICATE_VALIDATOR, SIGNER, TIMESTAMP_AUTHORITY, FILE_STORAGE],
})
export class ProvidersModule {}
