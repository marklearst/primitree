import { describe, it, expect } from 'vitest'
import {
  FIGMA_API_BASE_URL,
  FIGMA_FILES_ENDPOINT,
  FIGMA_LOCAL_VARIABLES_ENDPOINT,
  FIGMA_FILE_VARIABLES_PATH,
  FIGMA_PUBLISHED_VARIABLES_PATH,
  CONTENT_TYPE_JSON,
  FIGMA_TOKEN_HEADER,
  ERROR_MSG_TOKEN_REQUIRED,
  ERROR_MSG_TOKEN_FILE_KEY_REQUIRED,
  ERROR_MSG_BULK_UPDATE_FAILED,
  ERROR_MSG_CREATE_VARIABLE_FAILED,
  ERROR_MSG_DELETE_VARIABLE_FAILED,
  ERROR_MSG_UPDATE_VARIABLE_FAILED,
  ERROR_MSG_FETCH_FIGMA_DATA_FAILED,
} from '../../src/constants/index'

describe('constants', () => {
  describe('API URLs', () => {
    it('should have correct base URL', () => {
      expect(FIGMA_API_BASE_URL).toBe('https://api.figma.com')
    })

    it('should have correct files endpoint', () => {
      expect(FIGMA_FILES_ENDPOINT).toBe('https://api.figma.com/v1/files')
    })

    it('should generate correct file variables path', () => {
      const fileKey = 'test-file-key'
      expect(FIGMA_FILE_VARIABLES_PATH(fileKey)).toBe(
        '/v1/files/test-file-key/variables'
      )
    })

    it('should generate correct published variables path', () => {
      const fileKey = 'test-file-key'
      expect(FIGMA_PUBLISHED_VARIABLES_PATH(fileKey)).toBe(
        '/v1/files/test-file-key/variables/published'
      )
    })

    it('should generate correct local variables endpoint', () => {
      const fileKey = 'test-file-key'
      expect(FIGMA_LOCAL_VARIABLES_ENDPOINT(fileKey)).toBe(
        'https://api.figma.com/v1/files/test-file-key/variables/local'
      )
    })
  })

  describe('Headers', () => {
    it('should have correct content type', () => {
      expect(CONTENT_TYPE_JSON).toBe('application/json')
    })

    it('should have correct Figma token header', () => {
      expect(FIGMA_TOKEN_HEADER).toBe('X-FIGMA-TOKEN')
    })
  })

  describe('Error Messages', () => {
    it('should have correct auth error messages', () => {
      expect(ERROR_MSG_TOKEN_REQUIRED).toBe('Provide a Figma API token.')
      expect(ERROR_MSG_TOKEN_FILE_KEY_REQUIRED).toBe(
        'Provide a Figma API token and file key.'
      )
    })

    it('should have correct mutation error messages', () => {
      expect(ERROR_MSG_BULK_UPDATE_FAILED).toBe(
        'The bulk update request failed.'
      )
      expect(ERROR_MSG_CREATE_VARIABLE_FAILED).toBe(
        'The create-variable request failed.'
      )
      expect(ERROR_MSG_DELETE_VARIABLE_FAILED).toBe(
        'The delete-variable request failed.'
      )
      expect(ERROR_MSG_UPDATE_VARIABLE_FAILED).toBe(
        'The update-variable request failed.'
      )
    })

    it('should have correct fetch error message', () => {
      expect(ERROR_MSG_FETCH_FIGMA_DATA_FAILED).toBe(
        'The Figma API request failed.'
      )
    })
  })
})
