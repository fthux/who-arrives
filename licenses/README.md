# Bundled data attribution

`src/data/countries.json` is a derivative database of [mledoze/countries](https://github.com/mledoze/countries), made available under the Open Database License (ODbL) 1.0. It retains only common English names, capitals, currencies and official language data. Its country calling codes are derived from [Google libphonenumber](https://github.com/google/libphonenumber), licensed under Apache 2.0, replacing regional dialing suffixes with country calling codes. The derivative database is distributed under ODbL 1.0; application code is separate from this database.

The complete upstream licenses are in `countries.txt` and `libphonenumber.txt`. Pinned revisions, download URLs and source hashes are recorded in `src/data/provenance.json`. The generated derivative database and its reproducible transformation script are included in the project. When distributing this service, retain these attributions and make the derivative database available under its license.

Country/territory information follows the pinned source. It is reference information, not a live authoritative registry or an assertion of a visitor's personal language, currency, or phone number. Missing libphonenumber territories return null calling codes; they are not guessed from geographic proximity.
