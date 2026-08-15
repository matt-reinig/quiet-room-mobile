# Ambient audio assets

All four recordings in `assets/audio/ambient/` are bundled locally. The app does not hotlink or download audio at runtime. The selected licenses permit commercial use and modification without attribution; the source record is retained here even though attribution is not required.

| App environment | Bundled file | Source recording | Recording license | Local derivation | SHA-256 |
| --- | --- | --- | --- | --- | --- |
| Brown Noise | `brown-noise.mp3` | [Brown Noise by tracyradio](https://freesound.org/people/tracyradio/sounds/737409/) | CC0 | Freesound's HQ MP3 preview of the listed CC0 recording; 96.024 seconds | `ede75031c9944f017bce310ff040772d411cf4b689c1f50e1f05efa1d9ddc098` |
| Rain | `gentle-rain.mp3` | [Gentle Rain.wav by shelbyshark](https://freesound.org/people/shelbyshark/sounds/501243/) | CC0 | Freesound's HQ MP3 preview of the listed CC0 recording; 53.316 seconds | `5fffe1bb4acdd51270b0fa84614be3fa354155b08f60881f4fe12fd0ff53f423` |
| Quiet Church | `quiet-church.mp3` | [Church ambiance, quiet by hz37](https://freesound.org/people/hz37/sounds/792472/) | CC0 | Freesound's HQ MP3 preview of the listed CC0 recording; 65.352 seconds | `2441ce17d10d5c3ab8106608506caed9a0ebc0e2eefc56ef4e2046af0df8a451` |
| Faint Chant | `faint-chant.m4a` | [Improperia.ogg by Membeth](https://commons.wikimedia.org/wiki/File:Improperia.ogg) | Public domain dedication by the uploader, with an unconditional fallback license where dedication is not recognized | Wikimedia's MP3 transcode was converted locally to 64 kbps AAC/M4A with Apple's `afconvert`; 997.473 seconds. Faintness is applied through the app's low playback gain. | `322f01e6f425e780fadb0689e3d74fdcb8a68773f2197b0766af45a4fd3baedb` |

## Acquisition record

The three Freesound files were acquired from the CDN preview URLs linked by their source pages. Freesound's original-file download endpoints require an authenticated account; the preview files are transcodes of the same specifically licensed recordings.

The chant was acquired from Wikimedia's generated MP3 transcode of the public-domain source and converted with:

```bash
afconvert improperia.mp3 -o faint-chant.m4a -f m4af -d aac -b 64000 -q 96
```

No attribution-required recording is included.

## Manual listening gate

Before enabling `ambient_audio` for testers, listen on both phone speakers and headphones for:

- an audible loop boundary or MP3 encoder gap;
- distant thunder in Rain;
- muffled human sounds in Quiet Church becoming distracting;
- Faint Chant sounding like foreground music rather than distant ambience;
- perceived loudness differences between environments.

If any recording fails that gate, replace it with another CC0/public-domain recording and update this document and its checksum. Do not solve a poor source fit by raising playback volume.
