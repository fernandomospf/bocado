import { Transform } from 'class-transformer';
import { IsBoolean, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { INVITE_CODE_RE } from '../household.logic';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);

export class HouseholdNameDto {
  @IsString()
  @MinLength(2, { message: 'Dê um nome à casa' })
  @MaxLength(60)
  @Transform(trim)
  name: string;
}

export class JoinHouseholdDto {
  @IsString()
  @Matches(INVITE_CODE_RE, { message: 'Convite inválido' })
  @Transform(upper)
  code: string;
}

export class MemberPrefsDto {
  @IsBoolean()
  autoAcceptShared: boolean;
}
