// 생성 파일 — 손으로 고치지 않는다. 대상 정의에서 다시 만들려면: pnpm exec tsx tools/sprite-editor/build-targets.ts
window.SPRITE_EDITOR_DATA = {
  "outline": "#182540",
  "silhouette": "#22314a",
  "targets": {
    "fish": {
      "kind": "fish",
      "idLabel": "어종 id",
      "layout": {
        "grid": {
          "w": 32,
          "h": 16
        },
        "margin": 2,
        "presets": {
          "thumb": {
            "w": 30,
            "h": 16,
            "scale": 1
          },
          "icon": {
            "w": 84,
            "h": 44,
            "scale": 3
          },
          "portrait": {
            "w": 240,
            "h": 140,
            "scale": 6
          },
          "card": {
            "w": 160,
            "h": 90,
            "scale": 4
          }
        }
      },
      "palette": "per-sprite",
      "states": [
        "normal",
        "variant",
        "hidden"
      ],
      "motion": "swim"
    },
    "boat": {
      "kind": "boat",
      "layout": {
        "grid": {
          "w": 32,
          "h": 16
        },
        "margin": 0,
        "presets": {
          "thumb": {
            "w": 32,
            "h": 16,
            "scale": 1
          },
          "row": {
            "w": 64,
            "h": 32,
            "scale": 2
          },
          "hero": {
            "w": 96,
            "h": 48,
            "scale": 3
          }
        }
      },
      "palette": "shared",
      "states": [
        "default"
      ],
      "motion": "none"
    },
    "gear": {
      "kind": "gear",
      "layout": {
        "grid": {
          "w": 32,
          "h": 16
        },
        "margin": 0,
        "presets": {
          "thumb": {
            "w": 32,
            "h": 16,
            "scale": 1
          },
          "row": {
            "w": 64,
            "h": 32,
            "scale": 2
          },
          "hero": {
            "w": 96,
            "h": 48,
            "scale": 3
          }
        }
      },
      "palette": "shared",
      "states": [
        "default"
      ],
      "motion": "none"
    },
    "dish": {
      "kind": "dish",
      "idLabel": "요리 id",
      "layout": {
        "grid": {
          "w": 16,
          "h": 16
        },
        "margin": 2,
        "presets": {
          "row": {
            "w": 16,
            "h": 16,
            "scale": 1
          },
          "list": {
            "w": 32,
            "h": 32,
            "scale": 2
          },
          "hero": {
            "w": 48,
            "h": 48,
            "scale": 3
          }
        }
      },
      "palette": "per-sprite",
      "states": [
        "default"
      ],
      "motion": "none"
    },
    "bait": {
      "kind": "bait",
      "idLabel": "요리 id",
      "layout": {
        "grid": {
          "w": 16,
          "h": 16
        },
        "margin": 2,
        "presets": {
          "row": {
            "w": 16,
            "h": 16,
            "scale": 1
          },
          "list": {
            "w": 32,
            "h": 32,
            "scale": 2
          },
          "hero": {
            "w": 48,
            "h": 48,
            "scale": 3
          }
        }
      },
      "palette": "per-sprite",
      "states": [
        "default"
      ],
      "motion": "none"
    },
    "artifact": {
      "kind": "artifact",
      "layout": null,
      "palette": "per-sprite",
      "states": [
        "default"
      ],
      "motion": "none"
    }
  }
};
