# cloudflare-gyazo

Gyazo app on Cloudflare workers

## Installation

```
$ wrangler r2 bucket create gyazo
$ wrangler secret put GYAZO_USERNAME my-username
$ wrangler secret put GYAZO_PASSWORD my-password
$ wrangler publish
```

## License

MIT

## Author

Yasuhiro Matsumoto (a.k.a. mattn)
