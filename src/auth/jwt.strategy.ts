import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { JwtUser } from './jwt-user.type';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(config: ConfigService) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: config.get<string>(
                'JWT_SECRET',
                'jalweejfo32j9f3jgnl34ign3ag;3g;34gge;g4-g--_-gje4sgoe4-gG_',
            ),
        });
    }

    validate(payload: JwtUser): JwtUser {
        return payload;
    }
}
