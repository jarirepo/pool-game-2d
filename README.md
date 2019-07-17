# pool-game-2d
Implementation of the classic [8-ball][eight-ball] pool game for the HTML5 canvas.

- Using TypeScript, SASS with Parcel Bundler
- Using [Matter.js][matter-js] to handle the physics

# Running the program
First, install [Parcel][parcel-bundler] bundler:

<code>sudo npm i -g parcel-bundler</code>

then run `npm start` which will open your browser at http://localhost:3000.

You will probably need the latest version of Node (12.6.0) to make TypeScript work with Parcel Bundler 1.4.1, [read more][issue-1]

[eight-ball]: https://en.wikipedia.org/wiki/Eight-ball
[parcel-bundler]: https://parceljs.org/
[issue-1]: https://github.com/parcel-bundler/parcel/issues/579
[matter-js]: https://ghub.io/matter-js
[stats-js]: https://ghub.io/stats.js
