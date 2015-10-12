#!/bin/bash

#
# Usage genkey.sh firstname lastname email
#
FN="$1"
EMAIL="$2"
FN_UNDER=${FN// /_}

# Generate prefix that will be use for keyring filenames
EMAIL_NO_AT=`echo $EMAIL | sed 's/\@/_at_/'`
FILE_PREFIX="${FN_UNDER}_${EMAIL_NO_AT}"

# Key validity to use when generating keys
KEY_VALID="14d"

# Key size to use when creating keys
KEY_SIZE=1024

# Keyring file names
PUBRING="./${FILE_PREFIX}_pub.gpg"
SECRING="./${FILE_PREFIX}_sec.gpg"

# Generate key pair
gpg --gen-key --batch --no-default-keyring --no-tty - <<EOF
%pubring $PUBRING
%secring $SECRING
#%no-ask-passphrase
#%no-protection
Key-Type: RSA
Key-Length: $KEY_SIZE
Key-Usage: encrypt,sign,auth
Name-Real: $FN
Name-Email: $EMAIL
Expire-Date: $KEY_VALID
%commit
EOF

# Display public key
echo
echo "Public key for $FN <$EMAIL>"
echo
gpg --export --armor --no-default-keyring --keyring $PUBRING $EMAIL

# Display secret key
echo
echo "Secret key for $FN <$EMAIL>"
echo
gpg --export-secret-keys --armor --no-default-keyring --secret-keyring $SECRING $EMAIL

# Remove keyring files
rm -f $PUBRING $SECRING

