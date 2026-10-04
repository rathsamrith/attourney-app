import { Global, Module } from '@nestjs/common';
import {
  FakeCertificateValidator,
  FakeFaceMatch,
  FakeSigner,
  FakeTimestampAuthority,
  LocalFileStorage,
} from './fakes.js';
import { CERTIFICATE_VALIDATOR, FACE_MATCH, FILE_STORAGE, SIGNER, TIMESTAMP_AUTHORITY } from './providers.js';

/** Swap useClass for production adapters per environment. */
@Global()
@Module({
  providers: [
    { provide: FACE_MATCH, useClass: FakeFaceMatch },
    { provide: CERTIFICATE_VALIDATOR, useClass: FakeCertificateValidator },
    { provide: SIGNER, useClass: FakeSigner },
    { provide: TIMESTAMP_AUTHORITY, useClass: FakeTimestampAuthority },
    { provide: FILE_STORAGE, useClass: LocalFileStorage },
  ],
  exports: [FACE_MATCH, CERTIFICATE_VALIDATOR, SIGNER, TIMESTAMP_AUTHORITY, FILE_STORAGE],
})
export class ProvidersModule {}
