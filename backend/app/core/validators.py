from __future__ import annotations

import re

def only_digits(value: str) -> str:
    return re.sub(r"\D+", "", value or "")

def format_cnpj(value: str) -> str:
    d = only_digits(value)
    if len(d) != 14:
        return value
    return f"{d[0:2]}.{d[2:5]}.{d[5:8]}/{d[8:12]}-{d[12:14]}"

def is_valid_cnpj(value: str) -> bool:
    d = only_digits(value)
    if len(d) != 14:
        return False
    if d == d[0] * 14:
        return False

    weights1 = [5,4,3,2,9,8,7,6,5,4,3,2]
    weights2 = [6,5,4,3,2,9,8,7,6,5,4,3,2]

    nums = [int(x) for x in d]

    s1 = sum(nums[i] * weights1[i] for i in range(12))
    r1 = s1 % 11
    dv1 = 0 if r1 < 2 else 11 - r1
    if dv1 != nums[12]:
        return False

    s2 = sum(nums[i] * weights2[i] for i in range(13))
    r2 = s2 % 11
    dv2 = 0 if r2 < 2 else 11 - r2
    if dv2 != nums[13]:
        return False

    return True
