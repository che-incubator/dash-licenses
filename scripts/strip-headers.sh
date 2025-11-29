#!/bin/bash
#
# Copyright (c) 2018-2025 Red Hat, Inc.
# This program and the accompanying materials are made
# available under the terms of the Eclipse Public License 2.0
# which is available at https://www.eclipse.org/legal/epl-2.0/
#
# SPDX-License-Identifier: EPL-2.0
#
# Contributors:
#   Red Hat, Inc. - initial API and implementation
#  


# Script to remove all license headers from TypeScript files

echo "Removing all license headers from TypeScript files..."

find src tests -name "*.ts" -type f | while read file; do
  # Create a temporary file
  temp_file="${file}.tmp"
  
  # Skip lines until we find a line that doesn't start with /*, *, or */ 
  # and is not empty
  awk '
    BEGIN { inHeader = 1; emptyLines = 0 }
    {
      # If we are still in the header section
      if (inHeader) {
        # Check if line is part of comment or empty
        if ($0 ~ /^\/\*/ || $0 ~ /^ \*/ || $0 ~ /^ \*\// || $0 ~ /^$/) {
          # Skip this line (do not print)
          if ($0 ~ /^$/) emptyLines++
          next
        } else {
          # We found a non-header line, stop skipping
          inHeader = 0
        }
      }
      # Print all non-header lines
      print $0
    }
  ' "$file" > "$temp_file"
  
  # Replace original file
  mv "$temp_file" "$file"
  echo "  Processed: $file"
done

echo "Done! All headers removed."

