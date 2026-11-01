# Changelog

## [0.12.0](https://github.com/renanabade/darksouls-challenge/compare/darksouls-challenge-v0.11.0...darksouls-challenge-v0.12.0) (2026-11-01)


### Features

* **web:** static front that generates in the browser, deployed to Cloudflare Pages ([86889ad](https://github.com/renanabade/darksouls-challenge/commit/86889add63dc8f00a1ddd378c950a309c98c2094))


### Bug Fixes

* **generator:** scoped chapter exceptions, closed areas out of chapters, rule caps (generator 7) ([6ace95f](https://github.com/renanabade/darksouls-challenge/commit/6ace95f8a9f95dd593ab22bab427956b34c11753))


### Documentation

* add cloud session setup instructions ([fe48e18](https://github.com/renanabade/darksouls-challenge/commit/fe48e18fe902d29801a63a72e952ff0a427e88c5))

## [0.11.0](https://github.com/renanabade/darksouls-challenge/compare/darksouls-challenge-v0.10.0...darksouls-challenge-v0.11.0) (2026-10-23)


### Features

* **core:** bonfire availability from the game scripts ([093c8ec](https://github.com/renanabade/darksouls-challenge/commit/093c8ec5824ba490f51503ad3b320cba2c345cfa)), closes [#38](https://github.com/renanabade/darksouls-challenge/issues/38)
* **core:** mandatory bosses by configuration ([1267260](https://github.com/renanabade/darksouls-challenge/commit/1267260ae1591843b77b5d94511cff72d8b12079)), closes [#38](https://github.com/renanabade/darksouls-challenge/issues/38)
* **generator:** draw with generator 6 on data 0.7.0 ([2d9953a](https://github.com/renanabade/darksouls-challenge/commit/2d9953a929cd4026280f54028d6c88d78931e79d)), closes [#38](https://github.com/renanabade/darksouls-challenge/issues/38)
* **generator:** warn about NPCs in the manual ([ab94006](https://github.com/renanabade/darksouls-challenge/commit/ab940067246502ede3613bdde3739ababb1af240)), closes [#38](https://github.com/renanabade/darksouls-challenge/issues/38)


### Bug Fixes

* **core:** check every unavailable window of a one-bonfire target ([b60304f](https://github.com/renanabade/darksouls-challenge/commit/b60304f56bca0f2784d5c5258aaebd65060f91fc)), closes [#38](https://github.com/renanabade/darksouls-challenge/issues/38)
* **core:** close a before entrance for an item held from the start ([2be2606](https://github.com/renanabade/darksouls-challenge/commit/2be2606ef98f9fa865947107158ae049bf0de024)), closes [#38](https://github.com/renanabade/darksouls-challenge/issues/38)
* **core:** leave unmodeled bonfires out of one-bonfire ([4b64d48](https://github.com/renanabade/darksouls-challenge/commit/4b64d4846bfabf7c79e5ddae544bd58aca44e4b0))
* **core:** reject one-bonfire orders that name an unmodeled bonfire ([1434e85](https://github.com/renanabade/darksouls-challenge/commit/1434e85743c7209eba29ef364ce1d03f845e5a63))
* **core:** reject orders whose target a forbidden area cuts off ([8ebd835](https://github.com/renanabade/darksouls-challenge/commit/8ebd835adf3bbd6fb5f10f1db0ea839621bbc31c))
* **core:** skip a forbidden area that cuts off an earlier order ([b8c85f9](https://github.com/renanabade/darksouls-challenge/commit/b8c85f95db5369febe9a4298646df2812d09ee1a))
* **data:** chain the Hydra, Dusk and the DLC, and drop a comfort rule ([ddb92de](https://github.com/renanabade/darksouls-challenge/commit/ddb92ded051549ebfdba9a8ac7c28e3e6b2bffd1)), closes [#38](https://github.com/renanabade/darksouls-challenge/issues/38)
* **data:** gate Quelana on an upgraded flame and the Bed of Chaos ([5e5fe0a](https://github.com/renanabade/darksouls-challenge/commit/5e5fe0a2fec8ae0412dca9e97695fec775fcda9f)), closes [#38](https://github.com/renanabade/darksouls-challenge/issues/38)
* **data:** give Kaathe a region, and record how he leaves ([c3cf8ca](https://github.com/renanabade/darksouls-challenge/commit/c3cf8ca27294c75bae2577c9a257d6848022005e)), closes [#38](https://github.com/renanabade/darksouls-challenge/issues/38)
* **data:** make Domhnall's Ornstein and Smough sets exclusive ([c325046](https://github.com/renanabade/darksouls-challenge/commit/c325046ccfea51b736b727e88fff8200d56f940c)), closes [#38](https://github.com/renanabade/darksouls-challenge/issues/38)
* **data:** move Logan and Domhnall per the game scripts ([91a6b29](https://github.com/renanabade/darksouls-challenge/commit/91a6b2928e81f28a5d8f978d7e78eb88dc8279ea)), closes [#38](https://github.com/renanabade/darksouls-challenge/issues/38)
* **data:** record the two ways Rhea leaves ([c5f4a5d](https://github.com/renanabade/darksouls-challenge/commit/c5f4a5d744938fd3314d70d099c51ebcf1e4d4c2)), closes [#38](https://github.com/renanabade/darksouls-challenge/issues/38)
* **data:** say what turns the Darkmoon Knightess hostile ([d34bfa0](https://github.com/renanabade/darksouls-challenge/commit/d34bfa05e505d6255b522d9062520e11018c5688)), closes [#38](https://github.com/renanabade/darksouls-challenge/issues/38)
* **data:** warn about Lautrec and the Firelink Fire Keeper ([e34ca7c](https://github.com/renanabade/darksouls-challenge/commit/e34ca7c1b2e9c9c38d4b4cad87614224bebc6a2b)), closes [#38](https://github.com/renanabade/darksouls-challenge/issues/38)


### Documentation

* **adr:** format ADR 0011 ([c73bc36](https://github.com/renanabade/darksouls-challenge/commit/c73bc365c564b1b639599941e7727c9fd6975f4c)), closes [#38](https://github.com/renanabade/darksouls-challenge/issues/38)
* **data:** cite the flame menu behind Quelana's upgraders ([53cb6cd](https://github.com/renanabade/darksouls-challenge/commit/53cb6cd5fe34927543ab2a7fdea378b79b23258a)), closes [#38](https://github.com/renanabade/darksouls-challenge/issues/38)

## [0.10.0](https://github.com/renanabade/darksouls-challenge/compare/darksouls-challenge-v0.9.0...darksouls-challenge-v0.10.0) (2026-10-22)


### Features

* **api:** add the NestJS API foundation ([b0c6ae1](https://github.com/renanabade/darksouls-challenge/commit/b0c6ae1df42c0974853d1f01b688a5720849fed3))
* **api:** serve generation through GraphQL, with limits ([2a4ed52](https://github.com/renanabade/darksouls-challenge/commit/2a4ed52c0282a9ddc22f7e15007f83b582115159))
* **contracts:** share the generation request and the challenge document ([74e32c0](https://github.com/renanabade/darksouls-challenge/commit/74e32c02709a6470247c7f6d16a2e4d9d8602adc))
* **db:** add the Prisma schema, the outbox and the job repository ([46adf7b](https://github.com/renanabade/darksouls-challenge/commit/46adf7b5aa1097398283a97a82f0f1ab3d1e0a04))
* **worker:** generate challenges from a RabbitMQ queue ([e52de62](https://github.com/renanabade/darksouls-challenge/commit/e52de628a65d5995420323e6bc8ad663ef3f605d))

## [0.9.0](https://github.com/renanabade/darksouls-challenge/compare/darksouls-challenge-v0.8.0...darksouls-challenge-v0.9.0) (2026-10-21)


### Features

* **orders:** area rules for lizards, chests and bonfires (24 to 26) ([ccd7c04](https://github.com/renanabade/darksouls-challenge/commit/ccd7c04ae86b7fcce0d0cab17ce4b8a1d25ed3ab))
* **orders:** boss fights by element (orders 22 and 23) ([d6b8efe](https://github.com/renanabade/darksouls-challenge/commit/d6b8efe406a3bd24499ebe5d2f4096cac6dfdbfd))
* **orders:** errands and the other way (orders 27 and 28) ([021e372](https://github.com/renanabade/darksouls-challenge/commit/021e3723a4b13b3ed9701e5b73aaa0534533ad41))

## [0.8.0](https://github.com/renanabade/darksouls-challenge/compare/darksouls-challenge-v0.7.0...darksouls-challenge-v0.8.0) (2026-10-21)


### Features

* **generator:** balanced chapters, acts and curves that hold at the edges ([6dfbc91](https://github.com/renanabade/darksouls-challenge/commit/6dfbc916a9807ad8899424f4da6f24e3b0e9a1a3))

## [0.7.0](https://github.com/renanabade/darksouls-challenge/compare/darksouls-challenge-v0.6.0...darksouls-challenge-v0.7.0) (2026-10-21)


### Features

* **core:** the challenge as a journey in chapters ([dc6948a](https://github.com/renanabade/darksouls-challenge/commit/dc6948a55085c854dc378446be5e4fded3cbf410))

## [0.6.0](https://github.com/renanabade/darksouls-challenge/compare/darksouls-challenge-v0.5.0...darksouls-challenge-v0.6.0) (2026-10-20)


### Features

* **core:** schools of magic as a fighting style, two new restrictions ([2d30ee3](https://github.com/renanabade/darksouls-challenge/commit/2d30ee304b3e5a7845af9ffb8f4d79dd408e2135))
* **data:** spells with school, requirements, slots and damage ([70aa185](https://github.com/renanabade/darksouls-challenge/commit/70aa1855d074abb6f382633c88b50f7e1c590e1f))

## [0.5.0](https://github.com/renanabade/darksouls-challenge/compare/darksouls-challenge-v0.4.0...darksouls-challenge-v0.5.0) (2026-10-20)


### Features

* **core:** difficulty budget, layered curse and group handicap ([a31eada](https://github.com/renanabade/darksouls-challenge/commit/a31eada453366bc33f87c0d93dcf0d8c24287c85))

## [0.4.0](https://github.com/renanabade/darksouls-challenge/compare/darksouls-challenge-v0.3.0...darksouls-challenge-v0.4.0) (2026-10-20)


### Features

* **cli:** generate a challenge from the command line ([faff778](https://github.com/renanabade/darksouls-challenge/commit/faff7787f49eb36767fdd590989194a21149f5df))
* **core:** generate static challenges from a seed ([2fef1be](https://github.com/renanabade/darksouls-challenge/commit/2fef1be345610852bab55abf5e9d5182f1ff4a9d))

## [0.3.0](https://github.com/renanabade/darksouls-challenge/compare/darksouls-challenge-v0.2.0...darksouls-challenge-v0.3.0) (2026-10-20)


### Features

* **core:** validate the curse, earned levels and phase swaps ([56fd143](https://github.com/renanabade/darksouls-challenge/commit/56fd143c8608ea6b36ec1bcb5dbe88b8477c35ed))


### Bug Fixes

* **data:** gate Kaathe's return to the Abyss on the Four Kings (v0.4.0) ([e803629](https://github.com/renanabade/darksouls-challenge/commit/e803629f97e478bc6d15b6060f46b31014ee5546))

## [0.2.0](https://github.com/renanabade/darksouls-challenge/compare/darksouls-challenge-v0.1.0...darksouls-challenge-v0.2.0) (2026-10-20)


### Features

* **core:** validate weapon orders against the level cap and the bosses ([4a01830](https://github.com/renanabade/darksouls-challenge/commit/4a01830fd3e77eca826c1ad25504baa818284fa0))
* **data:** say what each milestone means on the graph (v0.3.0) ([b73494f](https://github.com/renanabade/darksouls-challenge/commit/b73494f572b6d4b72fe2c47704a8fef9857aeb76))

## 0.1.0 (2026-10-20)


### Features

* **core:** add requirement expressions ([f48e674](https://github.com/renanabade/darksouls-challenge/commit/f48e674830a9c4d50bb43e8c5980a2301b3b0aaa))
* **core:** add the order catalog as data ([e5fa894](https://github.com/renanabade/darksouls-challenge/commit/e5fa894acd42be0566706c72429def48f5b60ae4))
* **core:** load the world graph and compute reach ([4160f44](https://github.com/renanabade/darksouls-challenge/commit/4160f44139b3f8b1790da1d85bf337b45f7d8391))
* **core:** validate closed merchants and found pickups on real data ([1172202](https://github.com/renanabade/darksouls-challenge/commit/117220250f02de59b37f58d94d5d4fefd2127b2b))
* **core:** validate graph orders and their combinations ([e2a03cc](https://github.com/renanabade/darksouls-challenge/commit/e2a03cc5f4a13acfe306ea2a29378ff4bdc37077))
* **data:** add the Dark Souls Remastered data set v0.1.0 ([db062c6](https://github.com/renanabade/darksouls-challenge/commit/db062c6bbbf1e8c0545bbc3d80e8f02d2b446ff4))
* **data:** export found pickups, merchant regions and boss names (v0.2.0) ([fdf8f9c](https://github.com/renanabade/darksouls-challenge/commit/fdf8f9cd01425f7e7e20bd607d5c6daef6db932f))


### Documentation

* add contributing guide, code of conduct, security policy and templates ([0556a65](https://github.com/renanabade/darksouls-challenge/commit/0556a655471d314d0f309d442a2b3308ce1dd962))
* add readme and MIT license ([c47a67d](https://github.com/renanabade/darksouls-challenge/commit/c47a67d9078e2f2cd4568b867ac579daf3ae6fc4))
* add toolchain ADR and development guide ([82111f2](https://github.com/renanabade/darksouls-challenge/commit/82111f271a29f1b953ef71a4dab7b6e9e4281cb0))
* record the boundary validation decision (ADR 0002) ([4eef150](https://github.com/renanabade/darksouls-challenge/commit/4eef1501f00bc916828507aecf9a5cd6e5cbdf41))
