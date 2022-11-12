# openprocessing-backup
To backup all your sketches

```
cp .env.example .env
npm install
npm start
```

The program will automatically download all the sketches with assigned userid in the following structure.
- sketches
  -  `id` `title`
     -  info.json
     -  `id`.jpg
     -  sketch`id`.zip
     -  unziped sketch source code folder

![img](demo01.png)