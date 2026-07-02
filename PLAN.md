Plan to add a new Quality Control (QC) route to Mirabelle


# ASCII drawing of the new QC route in Mirabelle
┌─────────────────────────────────────────────────────────────────────────────┐
│   Current series, navigation, and filtering controls                        │
└─────────────────────────────────────────────────────────────────────────────┘
│                                 │                                           │
│                                 │                                           │
│                                 │         QC operations                     │
│                                 │                                           │
│                                 │                                           │
│                                 ┌───────────────────────────────────────────┐
│                                 │                                           │
│                                 │                                           │
│        Image view               │                                           │
│                                 │                                           │
│                                 │                                           │
│                                 │                                           │
│                                 │           DICOM Dump                      │
│                                 │                                           │
│                                 │                                           │
│                                 │                                           │
│                                 │                                           │
│                                 │                                           │
┌─────────────────────────────────│                                           │
│       Cine controls             │                                           │
└─────────────────────────────────│                                           │
│  Blank, or logos                │                                           │
│                                 │                                           │
└─────────────────────────────────└───────────────────────────────────────────┘

# New papi endpoints to support QC

## List QC Assignments
### Endpoint
GET /v1/distribution/qc/assignments
### Example output
```json
{
  "data": [
    {
      "assignment_id": 1,
      "qc_review_id": 1,
      "assigned_to": 0,
      "assignment_status": "in_progress",
      "share_percentage": 100,
      "when_created": "2026-06-29T21:41:58.048191+00:00",
      "who_created": 0,
      "when_updated": "2026-06-29T21:42:17.127525+00:00",
      "who_updated": 0,
      "series_total": 105,
      "series_pending": 104,
      "review_type": "full",
      "review_status": "open",
      "recordset_draft_id": 1,
      "recordset_id": 1,
      "recordset_name": "Radiology 01 Public"
    }
  ],
  "meta": {
    "count": 1,
    "total": 1
  }
}
```

## Get QC Assignment
### Endpoint
GET /v1/distribution/qc/assignments/{assignment_id}
### Example output
```json
{
  "data": {
    "assignment": {
      "assignment_id": 1,
      "qc_review_id": 1,
      "assigned_to": 0,
      "assignment_status": "in_progress",
      "share_percentage": 100,
      "when_created": "2026-06-29T21:41:58.048191+00:00",
      "who_created": 0,
      "when_updated": "2026-06-29T21:42:17.127525+00:00",
      "who_updated": 0
    },
    "review": {
      "qc_review_id": 1,
      "recordset_draft_id": 1,
      "review_type": "full",
      "review_status": "open",
      "sample_percentage": null
    },
    "series_by_status": [
      {
        "qc_status": "rejected",
        "count": 1
      },
      {
        "qc_status": "pending",
        "count": 104
      }
    ],
    "series_by_modality": [
      {
        "modality": "OT",
        "qc_status": "pending",
        "count": 3
      },
      {
        "modality": "NM",
        "qc_status": "pending",
        "count": 12
      },
      {
        "modality": "SR",
        "qc_status": "rejected",
        "count": 1
      },
      {
        "modality": "PT",
        "qc_status": "pending",
        "count": 1
      },
      {
        "modality": "SM",
        "qc_status": "pending",
        "count": 1
      },
      {
        "modality": "MR",
        "qc_status": "pending",
        "count": 18
      },
      {
        "modality": "SR",
        "qc_status": "pending",
        "count": 2
      },
      {
        "modality": "XA",
        "qc_status": "pending",
        "count": 9
      },
      {
        "modality": "US",
        "qc_status": "pending",
        "count": 5
      },
      {
        "modality": "PR",
        "qc_status": "pending",
        "count": 2
      },
      {
        "modality": "DX",
        "qc_status": "pending",
        "count": 11
      },
      {
        "modality": "CT",
        "qc_status": "pending",
        "count": 37
      },
      {
        "modality": "CR",
        "qc_status": "pending",
        "count": 3
      }
    ]
  }
}
```
## List Assignment Series
### Endpoint
GET /v1/distribution/qc/assignments/{assignment_id}/series
### Example output
```json
{
  "data": [
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.2.276.0.7230010.3.1.3.477404194.13684.1659468312.35",
      "qc_status": "pending",
      "series_file_hash": "85f957056b1dc8e4d248fa99a97c81eb",
      "modality": "SM",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.2.392.200036.9107.500.220.21732.2019062115365802.121",
      "qc_status": "pending",
      "series_file_hash": "df879029e5c660c9f6c9bd39032e0205",
      "modality": "CR",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.2.392.200036.9107.500.220.21732.2019062115370403.122",
      "qc_status": "pending",
      "series_file_hash": "badee5d9aeb5f919b232f0d572fefb73",
      "modality": "CR",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.2.392.200036.9107.500.220.21732.2019062115380905.123",
      "qc_status": "pending",
      "series_file_hash": "ec9a3df18b0bfdccaedb847c57cfa789",
      "modality": "CR",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.2.392.200036.9116.2.6.1.37090.3131128364.1482392072.429298",
      "qc_status": "pending",
      "series_file_hash": "3a7329ff3af3db2f01dade8d57f1f35e",
      "modality": "CT",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.2.392.200036.9116.2.6.1.44063.1797649225.1549381608.203892",
      "qc_status": "pending",
      "series_file_hash": "a3639659f36080550d6484a33b2aac9f",
      "modality": "CT",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.2.392.200036.9116.2.6.1.44063.1797649225.1549381662.189044",
      "qc_status": "pending",
      "series_file_hash": "28fcc2de0311ccdb8eae762270109d9c",
      "modality": "CT",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.2.392.200036.9116.2.6.1.44063.1797649225.1549381725.441660",
      "qc_status": "pending",
      "series_file_hash": "ff8c824d7b7fc93d2b0d194956a9caa7",
      "modality": "CT",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.2.392.200036.9116.2.6.1.44063.1797649225.1549381747.553394",
      "qc_status": "pending",
      "series_file_hash": "56312467695d4a37ffefcc77f1a2e5c7",
      "modality": "CT",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.2.392.200036.9116.2.6.1.44063.1797649225.1549381747.701041",
      "qc_status": "pending",
      "series_file_hash": "1b7305ee94614f06e3b20077d01015fd",
      "modality": "SR",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.2.392.200036.9116.2.6.1.44063.1797649225.1549381751.529048",
      "qc_status": "pending",
      "series_file_hash": "9c820cdb27c009c0018bdfc6e6be54d0",
      "modality": "CT",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.2.392.200036.9116.2.6.1.44063.1797649225.1549381787.445728",
      "qc_status": "pending",
      "series_file_hash": "48c188874ee18282bf30335cfbfef29c",
      "modality": "CT",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.2.392.200036.9116.2.6.1.44063.1797649225.1549381795.224911",
      "qc_status": "pending",
      "series_file_hash": "2ba82015049de6868e9837878eef127b",
      "modality": "CT",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.2.392.200036.9116.2.6.1.48.1215513646.1482388729.429084",
      "qc_status": "pending",
      "series_file_hash": "f1decb63e49f32284a7f567ec5f50b4c",
      "modality": "CT",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.2.392.200036.9116.2.6.1.48.1215513646.1482388893.347704",
      "qc_status": "pending",
      "series_file_hash": "029048d686995b44f999fb2a684d3f8b",
      "modality": "CT",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.2.392.200036.9116.2.6.1.48.1215513646.1482389831.596623",
      "qc_status": "pending",
      "series_file_hash": "30cde60a8ba312b8b67e1275ba530797",
      "modality": "CT",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.2.392.200036.9116.2.6.1.48.1215513646.1482390058.281008",
      "qc_status": "pending",
      "series_file_hash": "32102b1bd0b1ed9a60875ed208044a8e",
      "modality": "CT",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.2.392.200036.9116.2.6.1.48.1215513646.1482390089.967500",
      "qc_status": "pending",
      "series_file_hash": "1885361c6817816f49ec1d3b1ef67e80",
      "modality": "CT",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.2.40.1.6.8.168.109330229344.230301110406973131",
      "qc_status": "pending",
      "series_file_hash": "8fa0f8e3f7615eaa513b6cb8a09fcc56",
      "modality": "DX",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.2.40.1.6.8.168.109330229348.230301110406973131",
      "qc_status": "pending",
      "series_file_hash": "2d17016031a1c805e5ebca642bc94a59",
      "modality": "DX",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.2.40.1.6.8.168.109330229364.230301110758938277",
      "qc_status": "pending",
      "series_file_hash": "a932f068169bf76807f3a43e52ac58c6",
      "modality": "DX",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.2.40.1.6.8.168.109330229450.210714101925849115",
      "qc_status": "pending",
      "series_file_hash": "dfcba8c7ffd46d1095cbdfe5358ff6c9",
      "modality": "DX",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.2.40.1.6.8.168.109330229452.210714101925849115",
      "qc_status": "pending",
      "series_file_hash": "4a2b7b2bacfeac2a121c8e254bee6eb9",
      "modality": "DX",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.2.40.1.6.8.168.109330229454.210714101925849115",
      "qc_status": "pending",
      "series_file_hash": "e6e3a0f22295c3ae72c9a6e4aab2d6b3",
      "modality": "DX",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.2.752.24.10.2.1133898986.1201175615.958622608.1322713944",
      "qc_status": "pending",
      "series_file_hash": "360d4a296cd4a9cf90729a26fbc3fc92",
      "modality": "PR",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.2.752.24.10.2.3372017692.1099664084.3819600291.3137809361",
      "qc_status": "pending",
      "series_file_hash": "280f863e5ba99909c731ead80a7b5d8e",
      "modality": "PR",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.2.840.113619.2.256.896737675772.1466102004.892",
      "qc_status": "pending",
      "series_file_hash": "583832838622f466a65253ab8256bac3",
      "modality": "US",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.2.840.113619.2.323.963336015425.1565383498.15",
      "qc_status": "pending",
      "series_file_hash": "41bd921eca4eae0b5fce975b65259488",
      "modality": "US",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.2.840.113619.2.500.111049141897156824207812030998093130255",
      "qc_status": "pending",
      "series_file_hash": "76dc2ecca00ff8303e2fd4645ec9a30b",
      "modality": "CT",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.2.840.113619.2.500.208146258086881570801343996985976254940",
      "qc_status": "pending",
      "series_file_hash": "cb7dd398d1e2e4482567c64cdc414df5",
      "modality": "CT",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.2.840.113619.2.500.256597265894740123381867921804184305684",
      "qc_status": "pending",
      "series_file_hash": "bf557950f72ce8beff6b1861b85939cc",
      "modality": "CT",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.2.840.113619.2.500.313043986581431504277495156207860107436",
      "qc_status": "pending",
      "series_file_hash": "9558fc472181a8b6665d05d46dfd9c72",
      "modality": "CT",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.2.840.113619.2.500.315312747382204881857138234066161709276",
      "qc_status": "pending",
      "series_file_hash": "6114919e54f2cdf8249aec93571e554b",
      "modality": "CT",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.2.840.113619.2.500.320478260951551343431529353541150303064",
      "qc_status": "pending",
      "series_file_hash": "22c09c24babfb8cf18d4c9e85ee8b9ae",
      "modality": "CT",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.2.840.113663.1500.1.313640727.2.1.20190212.100043.796",
      "qc_status": "pending",
      "series_file_hash": "88fc054d21a1ffcee78cf90d0d375665",
      "modality": "US",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.2.840.113663.1500.1.313640727.7.1.20190212.100043.796",
      "qc_status": "rejected",
      "series_file_hash": "b069b7608b9142d53ee28ff92dc4e173",
      "modality": "SR",
      "assignment_id": 1,
      "notes": "I guess I can put anything here?"
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.2.840.113663.1500.1.441363814.2.1.20190430.105311.137",
      "qc_status": "pending",
      "series_file_hash": "01f516d914fa51ef9c587e0dd64ad541",
      "modality": "US",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.2.840.113663.1500.1.441363814.2.1.20220906.144201.462",
      "qc_status": "pending",
      "series_file_hash": "a43c6bd733b04dba233b44d1ef8c5a0e",
      "modality": "US",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.12.2.1107.5.4.5.136459.30000019080910565725000000348",
      "qc_status": "pending",
      "series_file_hash": "f47d5226b19e1c6c7446b539c918d385",
      "modality": "XA",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.12.2.1107.5.4.5.136459.30000019080910565725000000361",
      "qc_status": "pending",
      "series_file_hash": "ae97f7761a98392c5945a0adedadc9b7",
      "modality": "XA",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.12.2.1107.5.4.5.136459.30000019080910565725000000375",
      "qc_status": "pending",
      "series_file_hash": "d60d5e89469ee6c5d3e35bd9285e59ab",
      "modality": "XA",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.12.2.1107.5.4.5.136459.30000019080910565725000000377",
      "qc_status": "pending",
      "series_file_hash": "33ce61b21648a349fb57ff835cfb6273",
      "modality": "XA",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.12.2.1107.5.4.5.136459.30000019080910565725000000383",
      "qc_status": "pending",
      "series_file_hash": "326b09cb67d399b828c929809c9a7557",
      "modality": "XA",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.12.2.1107.5.4.5.136459.30000019080910565725000000385",
      "qc_status": "pending",
      "series_file_hash": "83f9714175eb8865bfe0999f8f5db6fd",
      "modality": "XA",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.12.2.1107.5.4.5.136459.30000019080910565725000000387",
      "qc_status": "pending",
      "series_file_hash": "2ed4ca971c7d12522b089f84491eeb15",
      "modality": "XA",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.12.2.1107.5.4.5.136459.30000019080910565725000000391",
      "qc_status": "pending",
      "series_file_hash": "f52859c5b04efa06ee35575ae75965f0",
      "modality": "XA",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.12.2.1107.5.4.5.136459.30000019080911004720300000012",
      "qc_status": "pending",
      "series_file_hash": "2b9ccd3e36b2dfd4c2e8da40929e9982",
      "modality": "XA",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.12.2.1107.5.6.1.2245.30720125090914021319700000014",
      "qc_status": "pending",
      "series_file_hash": "b0ad4e16472d8a21da7b262f1956398d",
      "modality": "NM",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.12.2.1107.5.6.1.2245.30720125090914021319700000016",
      "qc_status": "pending",
      "series_file_hash": "abd5cb462f11acf2e966cc1b7f78d063",
      "modality": "NM",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.12.2.1107.5.6.1.2245.30720125090914295885400000074",
      "qc_status": "pending",
      "series_file_hash": "0341892acf4e4275d4a11c57c110e590",
      "modality": "CT",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.12.2.1107.5.6.1.2245.30720125090914295885400000277",
      "qc_status": "pending",
      "series_file_hash": "608eacb48172fd04938fe6a14652b9f2",
      "modality": "CT",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.12.2.1107.5.6.1.2245.30720125090914304742800000000",
      "qc_status": "pending",
      "series_file_hash": "c11a0d94dbb0212e471cf2295bb93b03",
      "modality": "CT",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.12.2.1107.5.6.1.2245.30720125090914304742800000032",
      "qc_status": "pending",
      "series_file_hash": "87dc69afef9ec58dfb78597f4b9f5d66",
      "modality": "CT",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.12.2.1107.5.6.1.2245.30720125090914304742800000128",
      "qc_status": "pending",
      "series_file_hash": "5941f73e1ae41fa5725e5263e34a20ef",
      "modality": "CT",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.12.2.1107.5.6.1.2245.30720125090914304742800000401",
      "qc_status": "pending",
      "series_file_hash": "b1a4d8d2544fb6537cb555cfab843ffc",
      "modality": "CT",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.12.2.1107.5.6.1.2245.30720125090914382264100000007",
      "qc_status": "pending",
      "series_file_hash": "eb79c4ee4d149832f60185d03d479860",
      "modality": "SR",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.12.2.1107.5.6.1.2245.30720125090914382264100000105",
      "qc_status": "pending",
      "series_file_hash": "b6a8b49dd97de4d0821380bdbb6b676d",
      "modality": "CT",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.12.2.1107.5.6.1.2245.30720125090914382264100000202",
      "qc_status": "pending",
      "series_file_hash": "f9e165d7a9ba589948602368f7558423",
      "modality": "CT",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.12.2.1107.5.6.1.2245.30720125090916544257500000008",
      "qc_status": "pending",
      "series_file_hash": "1d890ad86a91138ddbb2b6aeed271f7c",
      "modality": "NM",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.12.2.1107.5.6.1.2245.30720125090916544257500000010",
      "qc_status": "pending",
      "series_file_hash": "5f0cc211d570454630c4b43f0de89670",
      "modality": "NM",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.12.2.1107.5.6.1.2245.30720125090916544257500000018",
      "qc_status": "pending",
      "series_file_hash": "917cdad40feb2cefe8e3414be3ba8bc7",
      "modality": "NM",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.12.2.1107.5.6.1.2245.30720125090916544257500000020",
      "qc_status": "pending",
      "series_file_hash": "d5ec9e96388aac0e5e5b99fc8bd69664",
      "modality": "NM",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.12.2.1107.5.6.1.2245.30720125090917084150100000117",
      "qc_status": "pending",
      "series_file_hash": "3629c4f973aed0e9d7164aec33ace132",
      "modality": "NM",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.12.2.1107.5.6.1.2245.30720125090917084150100000120",
      "qc_status": "pending",
      "series_file_hash": "05f760da31cee296b19316784a55fcae",
      "modality": "NM",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.12.2.1107.5.6.1.2245.30720125090917084150100000123",
      "qc_status": "pending",
      "series_file_hash": "7bd079209dcc0b7b73ec593464297b18",
      "modality": "NM",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.12.2.1107.5.6.1.2245.30720125090917084150100000126",
      "qc_status": "pending",
      "series_file_hash": "c29c47513521faf0e1b66da328870e69",
      "modality": "NM",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.12.2.1107.5.6.1.2245.30720125090917084150100000129",
      "qc_status": "pending",
      "series_file_hash": "82fb65a020a363ff689c5d51952a01bb",
      "modality": "NM",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.12.2.1107.5.6.1.2245.30720125090917084150100000132",
      "qc_status": "pending",
      "series_file_hash": "40464946ba1c0b8d848175831a1d3636",
      "modality": "NM",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.46.670589.11.41517.5.0.10100.2017033115111953000",
      "qc_status": "pending",
      "series_file_hash": "2997c3ece585ae0f459730c80e095878",
      "modality": "MR",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.46.670589.11.41517.5.0.10104.2017033115184359000",
      "qc_status": "pending",
      "series_file_hash": "a874950029a80c310d8c2abd0d940559",
      "modality": "MR",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.46.670589.11.41517.5.0.1368.2017033115183861000",
      "qc_status": "pending",
      "series_file_hash": "c61cc54cc4530c1aef8b37655c993889",
      "modality": "MR",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.46.670589.11.41517.5.0.4488.2017033115052828522",
      "qc_status": "pending",
      "series_file_hash": "3fab9a8bc0daa462841bbf28fb0a3e29",
      "modality": "MR",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.46.670589.11.41517.5.0.4488.2017033115063828544",
      "qc_status": "pending",
      "series_file_hash": "7694526e5d2a7053741643d11d379d13",
      "modality": "MR",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.46.670589.11.41517.5.0.4488.2017033115100744568",
      "qc_status": "pending",
      "series_file_hash": "ffab42590df12920a1fb19ced14192e5",
      "modality": "MR",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.46.670589.11.41517.5.0.4488.2017033115110213612",
      "qc_status": "pending",
      "series_file_hash": "a1dee3931cec08e2702493eac8901faf",
      "modality": "MR",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.46.670589.11.41517.5.0.4488.2017033115133434716",
      "qc_status": "pending",
      "series_file_hash": "46d9541816d74048c1505bd840c0af1d",
      "modality": "MR",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.46.670589.11.41517.5.0.4488.2017033115155133742",
      "qc_status": "pending",
      "series_file_hash": "eae0c24e0b35a60130a5af9ac058f0d7",
      "modality": "MR",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.46.670589.11.41517.5.0.4488.2017033115182742743",
      "qc_status": "pending",
      "series_file_hash": "e20c42eea46b4c9df1bc3116a662b588",
      "modality": "MR",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.46.670589.11.41517.5.0.4488.2017033115203238920",
      "qc_status": "pending",
      "series_file_hash": "b1c3a7181ed8e1122659766c6ca9a54c",
      "modality": "MR",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.46.670589.11.41517.5.0.6168.2017033115111711000",
      "qc_status": "pending",
      "series_file_hash": "233dd9541d590ac84a68facfcf3761c7",
      "modality": "MR",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.46.670589.11.41517.5.0.7044.2017033115112457000",
      "qc_status": "pending",
      "series_file_hash": "995155ffd7da5c71cca5e34af33d4843",
      "modality": "MR",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.46.670589.11.41517.5.0.7576.2017033115183342000",
      "qc_status": "pending",
      "series_file_hash": "596cd8d8edff5c6ea165988141c67e04",
      "modality": "MR",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.46.670589.11.41517.5.0.7856.2017033115110606000",
      "qc_status": "pending",
      "series_file_hash": "7bae5464dbf92ef22687eaaef4e0a5c5",
      "modality": "MR",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.46.670589.11.41517.5.0.9488.2017033115112720000",
      "qc_status": "pending",
      "series_file_hash": "2cdd5dca97eb1a2e6dd3362233a0ffb9",
      "modality": "MR",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.46.670589.11.41517.5.0.9684.2017033115112187000",
      "qc_status": "pending",
      "series_file_hash": "e66bad691ca36c08694960aad5bbcce6",
      "modality": "MR",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.46.670589.26.702028.22.20190604.142833.1",
      "qc_status": "pending",
      "series_file_hash": "0eb42fea99aea9fb1814d0a5464c5b5e",
      "modality": "DX",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.46.670589.30.1.6.1.963332985138.1485594384640.1",
      "qc_status": "pending",
      "series_file_hash": "e86959a412eff56caede0d8a91bcbb2a",
      "modality": "DX",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.46.670589.30.1.6.1.963334838256.1704782151156.1",
      "qc_status": "pending",
      "series_file_hash": "e875146b1efd18e6e0ffda8096a1b5cf",
      "modality": "DX",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.46.670589.30.1.6.1.963334838256.1704782151937.1",
      "qc_status": "pending",
      "series_file_hash": "9f1150a79d0c5fef83ef48ea608aaa05",
      "modality": "DX",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.46.670589.30.1.6.1.966169909266.1756820958359.1",
      "qc_status": "pending",
      "series_file_hash": "af35c356ae12787277c8d7688254e9ac",
      "modality": "DX",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.6.1.4.1.14519.5.2.1.1427.3349.13549693880270221664789880232308728336",
      "qc_status": "pending",
      "series_file_hash": "9fc771f13dc1c0c32f4b3264b32a62b8",
      "modality": "CT",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.6.1.4.1.14519.5.2.1.22969229640533524449810731039905253225",
      "qc_status": "pending",
      "series_file_hash": "1414671c81dacc2969be74fac9bb4bad",
      "modality": "CT",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.6.1.4.1.14519.5.2.1.256251222890617198705669325456912237196",
      "qc_status": "pending",
      "series_file_hash": "f4d6334c1a1b1f045de77bde5c9fe0d9",
      "modality": "CT",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.6.1.4.1.14519.5.2.1.35999796230418387409269378418981846912",
      "qc_status": "pending",
      "series_file_hash": "6b30ecdbb36ac295168479a99bff20de",
      "modality": "PT",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.6.1.4.1.14519.5.2.1.4429.7055.429107929011984557527790433794",
      "qc_status": "pending",
      "series_file_hash": "ecd0be7134ba04361a0da7c72cee9be3",
      "modality": "MR",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.6.1.4.1.14519.5.2.1.4801.5885.113884838686340531426541864075",
      "qc_status": "pending",
      "series_file_hash": "cebf0c37a40de95ec67cdece82d5c836",
      "modality": "CT",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.6.1.4.1.14519.5.2.1.4801.5885.157595833287804567960550429707",
      "qc_status": "pending",
      "series_file_hash": "3592d8a2c97f5a1ba19354f28638266d",
      "modality": "CT",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.6.1.4.1.14519.5.2.1.4801.5885.194372676203706186283173165298",
      "qc_status": "pending",
      "series_file_hash": "31b9a841d3f6bd88af19ee419c2083e2",
      "modality": "CT",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.6.1.4.1.14519.5.2.1.4801.5885.826249787404166018263132714033",
      "qc_status": "pending",
      "series_file_hash": "0e1ea08075ae146fc8e187e10aedd6bc",
      "modality": "CT",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.6.1.4.1.14519.5.2.1.4801.5885.855568664573801416990478461168",
      "qc_status": "pending",
      "series_file_hash": "a30968158821f304d081a2be1b41ba05",
      "modality": "CT",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.6.1.4.1.14519.5.2.1.4801.5885.958867105984142066301037319893",
      "qc_status": "pending",
      "series_file_hash": "ac90425d507b666edb6f149d49dfca83",
      "modality": "CT",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "1.3.6.1.4.1.14519.5.2.1.750450405902869895884286577826053467",
      "qc_status": "pending",
      "series_file_hash": "65cad8744c57700a269bb88363c27c90",
      "modality": "CT",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "2.25.26694550284351243382345180032248872228.2.100",
      "qc_status": "pending",
      "series_file_hash": "b162aaae04aab908c1f67dcff47f225e",
      "modality": "OT",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "2.25.26694550284351243382345180032248872228.361.300",
      "qc_status": "pending",
      "series_file_hash": "4d1cb7f7999c53fb30ce8d6aa757f868",
      "modality": "OT",
      "assignment_id": 1,
      "notes": null
    },
    {
      "qc_review_id": 1,
      "series_instance_uid": "2.25.26694550284351243382345180032248872228.91.200",
      "qc_status": "pending",
      "series_file_hash": "9fbec927d2d6a8fca381e30862b0cda5",
      "modality": "OT",
      "assignment_id": 1,
      "notes": null
    }
  ],
  "meta": {
    "count": 105,
    "total": 105
  }
}
```
## List Assignment Series Files
### Endpoint
GET /v1/distribution/qc/assignments/{assignment_id}/series/{series_instance_uid}/files
### Example output
```json
{
  "data": [
    {
      "file_id": 2584,
      "num_of_frames": 1,
      "file_path": "/home/posda/cache/created/8c/87/1a/8c871a46686f43f0cf57209862ddee81"
    },
    {
      "file_id": 2585,
      "num_of_frames": 1,
      "file_path": "/home/posda/cache/created/a1/5d/2b/a15d2b4202ab0190bf620f260462ac57"
    },
    {
      "file_id": 2586,
      "num_of_frames": 4,
      "file_path": "/home/posda/cache/created/b3/d2/88/b3d2883b54c7c5421980954e465a4f18"
    },
    {
      "file_id": 2582,
      "num_of_frames": 9,
      "file_path": "/home/posda/cache/created/16/ec/0b/16ec0bcd87c6574e9a63bde0e2d0a724"
    },
    {
      "file_id": 2587,
      "num_of_frames": 25,
      "file_path": "/home/posda/cache/created/29/d1/bf/29d1bf91555c10ffd340d20576d223af"
    },
    {
      "file_id": 2589,
      "num_of_frames": 400,
      "file_path": "/home/posda/cache/created/37/f3/a9/37f3a9a2e3420303aeca607011d56bbf"
    },
    {
      "file_id": 2581,
      "num_of_frames": 1600,
      "file_path": "/home/posda/cache/created/a3/e6/a5/a3e6a5cc1bfbeda4bb229fa728486259"
    },
    {
      "file_id": 2583,
      "num_of_frames": 1,
      "file_path": "/home/posda/cache/created/97/fa/20/97fa20a508b4653bad6557a777624b35"
    },
    {
      "file_id": 2588,
      "num_of_frames": 100,
      "file_path": "/home/posda/cache/created/7e/93/27/7e9327d6ec27d5d18b34ce8c0017f74e"
    }
  ],
  "meta": {
    "count": 9,
    "assignment_id": 1,
    "series_instance_uid": "1.2.276.0.7230010.3.1.3.477404194.13684.1659468312.35"
  }
}
```
## Set Series Status
Note that for this one, you will have to check the openapi.json for the body
schema. 
### Endpoint
PUT /v1/distribution/qc/assignments/{assignment_id}/series/{series_instance_uid}/status
### Example output
```json
{
  "data": {
    "qc_review_id": 1,
    "series_instance_uid": "1.2.276.0.7230010.3.1.3.477404194.13684.1659468312.35",
    "qc_status": "approved",
    "series_file_hash": "85f957056b1dc8e4d248fa99a97c81eb",
    "notes": "string",
    "modality": "SM",
    "assignment_id": 1
  }
}
```
## Get Series History
### Endpoint
GET /v1/distribution/qc/assignments/{assignment_id}/series/{series_instance_uid}/history
## Example output
```json
{
  "data": [
    {
      "history_id": 2,
      "qc_review_id": 1,
      "series_instance_uid": "1.2.276.0.7230010.3.1.3.477404194.13684.1659468312.35",
      "previous_status": "pending",
      "new_status": "approved",
      "when_updated": "2026-07-02T21:17:09.462410+00:00",
      "who_updated": 1,
      "notes": "string"
    }
  ],
  "meta": {
    "count": 1
  }
}
```

---

# Design Plan

## Resolved decisions

1. **Rendering mode:** Every QC series renders as a **flat stack with cine
   controls** — no volume/MPR view for now. (QC endpoints don't expose a
   `volumetric` flag, and always-stack is the simplest correct baseline. We can
   revisit modality-based volume rendering later.)
2. **QC actions:** The Set Series Status endpoint accepts `pending`,
   `approved`, `rejected`, `flagged`. Series start `pending`. The operations
   panel exposes three actions:
   - **Approve** → `approved`, note **optional**.
   - **Reject** → `rejected`, note **required**.
   - **Flag** → `flagged`, note **required**. (Meaning of "flagged" TBD; treated
     as just another status for now.)
   After a successful status set, auto-advance to the next series (mirrors the
   DICOM review flow's `onNext()` after marking).
3. **DICOM Dump:** Follows the **currently displayed frame**. Generated
   **client-side** from the DICOM already loaded into Cornerstone, replacing the
   slow server-side `/papi/v1/dump/{file_id}` call for this route (see below).
4. **Assignment lifecycle:** **Not handled for now.** The route opens straight
   to an already-claimed/assigned assignment. We do *not* call claim/release or
   gate on `assignment_status`, and there is **no explicit "complete/submit"**
   step in v1 — QC is implicitly done when no series remain `pending`.
5. **Ownership enforcement:** The route is **read-only unless the current user
   owns the assignment** (`current_user.user_id === assignment.assigned_to`).
   On mismatch, render the viewer/dump but disable the QC operation buttons
   (with a visible "assigned to user N" notice). The current user comes from
   `GET /papi/v1/other/testme`, which returns a `User`
   (`user_id`, `username`, `full_name`, `disabled`) — extend the existing
   `getUsername()` into a `getCurrentUser()` that returns `user_id` too.
6. **Progress indicator:** Show a **compact progress header** built from the
   assignment's `series_by_status` rollup (e.g. `104 pending | 1 rejected | 105
   total`). No modality breakdown in v1.
7. **Volume rendering:** **Out of scope** — always stack + cine, indefinitely.
   Don't add seams/abstractions for volume/MPR now.

## API base / new data-layer functions

All papi calls go through `requestJSON` (`src/lib/http.js`) against the
`/papi/v1/...` prefix, so QC endpoints are `/papi/v1/distribution/qc/...`.
Add these to `src/utilities.js` (or a new `src/qc.js` module — see
"Component architecture"):

| Function | Endpoint | Purpose |
| --- | --- | --- |
| `getQCAssignment(assignmentId)` | `GET .../assignments/{id}` | Assignment + review + status/modality rollups (for header/summary). |
| `getQCAssignmentSeries(assignmentId, {qcStatus, modality, page, limit})` | `GET .../assignments/{id}/series` | The ordered series list to navigate/filter. Supports `qc_status` and `modality` query params. |
| `getQCSeriesFiles(assignmentId, seriesUid)` | `GET .../assignments/{id}/series/{uid}/files` | `{file_id, num_of_frames, file_path}[]` — used to build imageIds. |
| `setQCSeriesStatus(assignmentId, seriesUid, qcStatus, notes)` | `PUT .../assignments/{id}/series/{uid}/status` | Body `QCSeriesStatusUpdate`: `{ qc_status, notes? }`. |
| `getQCSeriesHistory(assignmentId, seriesUid)` | `GET .../assignments/{id}/series/{uid}/history` | Audit trail (optional panel/tooltip). |
| `getCurrentUser()` | `GET /papi/v1/other/testme` | Returns `User` incl. `user_id`; used for the ownership/read-only check. (Refactor of existing `getUsername()`.) |

Not needed for v1 (documented for later): `series/summary`,
`series/status` (batch), assignment `claim`/`release`/`update`.

## Image loading (stack)

The series-files response is the **same shape** `getIECInfo` already consumes,
so we build imageIds directly — no IEC needed:

```
for file of files:
  for i in 0..file.num_of_frames:
    num_of_frames > 1
      ? `wadouri:/files/${file.file_path}?frame=${i}`
      : `wadouri:/files/${file.file_path}`
```

(Note field name is `file_path` here vs `path` in the IEC frames endpoint.)
Reuse `decimateFrames()` for very large series. Feed the resulting imageIds into
the existing **`StackView`** / `StackViewport` components unchanged.

## Routing

Follow the existing `Route*` + feature-component convention and register in
`src/index.js` (basename `/mira`). The route opens directly to an assignment;
the selected series and filters live in the URL so navigation is
back/forward-friendly:

```
qc/assignments/:assignmentId
qc/assignments/:assignmentId/:seriesUid
qc/assignments/:assignmentId/:seriesUid/:qcStatus/:modality   (filters)
```

- Loader resolves `assignmentId`; the route component fetches the (filtered)
  series list and, if no `seriesUid` (or `*`), redirects to the first series —
  exactly the pattern in `RouteDicomReviewVR`.
- Prev/next compute neighbors from the fetched series list (same `idOf`/offset
  logic as DICOM review, keyed on `series_instance_uid`).
- **Note:** `series_instance_uid` contains dots but no slashes, so it's safe as
  a single path segment. Verify no encoding issues with react-router.

## Component architecture

Create a dedicated **`src/features/qc/`** module rather than bending the
IEC-centric `DicomReviewIEC` to fit. QC is series/file-centric (identified by
`assignment_id` + `series_instance_uid`), not IEC-centric, so a parallel
component keeps both flows readable. Reuse shared pieces:

- **Reuse as-is:** `RouteLayout`, `StackView` / `StackViewport`, `ToolsPanel`,
  `NavigationPanel`, `DetailsPanel`, `LoadingSpinner`, `ViewportPlaceholder`,
  `notify` / `messages`.
- **New:** `RouteQCAssignment` (route), `QCAssignment` (feature/orchestrator),
  `QCOperationsPanel`, `QCDicomDump`, `CineControls`, and a QC filter control
  (either reuse `FilterPanel` with QC options or a thin QC-specific variant).
- **presentationSlice/config:** add a `setQCConfig` reducer + a `qc` TASK_CONFIG
  turning on the tools/right panel and the QC operation buttons, mirroring
  `setVisualReviewConfig` / `VISUAL_REVIEW_CONFIG`.

### Layout mapping (from the ASCII drawing)

| Region | Component | Column in `RouteLayout` |
| --- | --- | --- |
| Top: current series / nav / filter controls | `NavigationPanel` + QC filter | left panel (nav) + middle-top (filter), matching DICOM review |
| Center: image view | `StackView` | middle |
| Bottom-left: cine controls | `CineControls` (new) | middle (under viewer) |
| Bottom-left: blank / logos | static footer | left panel bottom |
| Right-top: QC operations | `QCOperationsPanel` | right panel |
| Right-bottom: DICOM Dump | `QCDicomDump` | right panel |

## QC operations panel + notes

- Buttons: **Approve**, **Reject**, **Flag**. Hotkeys (mirroring DICOM review's
  `g`/`b`/... via `useHotkeys`), e.g. `a`/`r`/`f`.
- **Note handling:** Reject and Flag require a note. On click, reveal/focus a
  note textarea and require non-empty text before calling `setQCSeriesStatus`;
  Approve submits immediately (note optional if the field has text).
- On success: `notify.success(...)`, then `onNext()` to auto-advance.
- On failure: `notify.error(error, ...)`, stay on the series.
- **Read-only mode:** when `current_user.user_id !== assignment.assigned_to`,
  disable all three buttons and the hotkeys, and show an "assigned to user N"
  notice. The viewer, dump, cine, and navigation stay fully usable.

## Progress header

A compact, always-visible indicator derived from the assignment's
`series_by_status` rollup (from `getQCAssignment`), e.g.
`104 pending | 1 rejected | 105 total`. Lives in the top/nav strip. Refresh its
counts after each successful status change (either optimistically or by
re-fetching the assignment).

## DICOM Dump (client-side, follows current frame)

Replace the slow `/papi/v1/dump/{file_id}` fetch for this route with a
client-side dump built from data Cornerstone has **already loaded**:

- `StackView`/`StackViewport` already reports the current imageId (via
  `setOption('currentImageId', ...)`). The QC dump keys off that.
- Access the parsed dataset without re-fetching:
  `wadouri.dataSetCacheManager.get(<file-uri>)` returns the dicom-parser
  `dataSet`; walk `dataSet.elements` to render tag / VR / value rows.
  (`wadouri` and `dataSetCacheManager` are exported from
  `@cornerstonejs/dicom-image-loader` — confirmed in installed version.)
- Fallback / richer names: `fetchFileAsArrayBuffer(fileId)` (exists) →
  `dcmjs` `DicomMessage.readFile` + `DicomMetaDictionary.naturalizeDataset`
  for human-readable tag names. Decide during implementation whether the
  dicom-parser element walk is sufficient or we want dcmjs naming.
- **Open detail:** map current imageId → `file_id`. The imageId path is the
  file path; we have `file_path`↔`file_id` from the series-files response, so
  keep that lookup map when building imageIds.

## Cine controls (net-new)

No cine component exists today. Build a small `CineControls`:
- Play/pause, next/prev frame, speed (fps) — drives the StackViewport's current
  frame index. Investigate Cornerstone Tools' cine utilities vs a simple
  `setInterval` advancing the viewport image index.
- Should stay in sync with the `currentImageId` option so the DICOM Dump keeps
  following along.

## Suggested implementation phases

1. **Data layer:** add the QC `utilities`/`qc.js` functions + a test mirroring
   `utilities.test.js`.
2. **Route + navigation:** `RouteQCAssignment`, register route, series list
   fetch + first-series redirect + prev/next. Render series in a plain
   `StackView` (no ops/dump yet).
3. **QC operations panel + notes + status PUT + auto-advance.**
4. **Client-side DICOM Dump** following the current frame.
5. **Cine controls.**
6. **Filtering** (qc_status / modality) wired into the URL + series fetch.
7. Config/slice (`setQCConfig`) + styling to match the ASCII layout.

## Open questions / follow-ups

- What does **`flagged`** mean vs `rejected`? (User to clarify with backend.)
  Does not block implementation — it's just a third status/button for now.
- **Read-only UX detail:** confirm the exact copy/placement of the "not your
  assignment" notice, and whether it should also suppress hotkeys silently or
  toast an explanation when a disabled action is attempted.
- Deferred to later (endpoints exist, not built in v1): assignment
  `claim`/`release`/`update`, batch `series/status`, `series/summary`, and any
  explicit assignment-completion workflow.

## Resolved (recorded for reference)

- Ownership: **read-only unless** `current_user.user_id === assigned_to`.
- Progress UI: **status rollup header only** (no modality breakdown).
- Completion: **implicit** (done when nothing is `pending`); no submit button.
- Rendering: **stack + cine only**, volume out of scope indefinitely.
