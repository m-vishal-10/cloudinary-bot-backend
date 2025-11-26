const express = require('express');
const cors = require('cors');
const cloudinary = require('cloudinary').v2;
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const multer = require('multer');
const upload = multer();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Configure Cloudinary credentials for a user
app.post('/api/configure', async (req, res) => {
  try {
    const { userId, cloudName, apiKey, apiSecret } = req.body;

    // 🚫 PREVENT DUPLICATE CLOUDINARY ACCOUNTS
    const { data: existingCloudinaryAccount, error: checkError } = await supabase
      .from('cloudinary_users')
      .select('user_id')
      .eq('cloud_name', cloudName)
      .eq('api_key', apiKey)
      .single();

    if (existingCloudinaryAccount) {
      if (existingCloudinaryAccount.user_id !== userId) {
        return res.status(400).json({
          status: 'error',
          message: `This Cloudinary account is already connected by another user. Each Cloudinary account can only be linked to one Cliq user.`
        });
      }
    }

    // Test credentials and upsert...
    const isValid = await testCloudinaryCredentials(cloudName, apiKey, apiSecret);
    if (!isValid) {
      return res.status(400).json({ status: 'error', message: 'Invalid credentials' });
    }

    const { error } = await supabase
      .from('cloudinary_users')
      .upsert(
        {
          user_id: userId,
          cloud_name: cloudName,
          api_key: apiKey,
          api_secret: apiSecret,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'user_id' }
      );

    if (error) throw error;

    res.json({
      status: 'success',
      message: 'Cloudinary account connected successfully!',
      cloud_name: cloudName
    });

  } catch (error) {
    console.error('Configure error:', error);
    res.status(500).json({ status: 'error', message: 'Configuration failed' });
  }
});app.post('/api/configure', async (req, res) => {
  try {
    const { userId, cloudName, apiKey, apiSecret } = req.body;

    // 🚫 PREVENT DUPLICATE CLOUDINARY ACCOUNTS
    const { data: existingCloudinaryAccount, error: checkError } = await supabase
      .from('cloudinary_users')
      .select('user_id')
      .eq('cloud_name', cloudName)
      .eq('api_key', apiKey)
      .single();

    if (existingCloudinaryAccount) {
      if (existingCloudinaryAccount.user_id !== userId) {
        return res.status(400).json({
          status: 'error',
          message: `This Cloudinary account is already connected by another user. Each Cloudinary account can only be linked to one Cliq user.`
        });
      }
    }

    // Test credentials and upsert...
    const isValid = await testCloudinaryCredentials(cloudName, apiKey, apiSecret);
    if (!isValid) {
      return res.status(400).json({ status: 'error', message: 'Invalid credentials' });
    }

    const { error } = await supabase
      .from('cloudinary_users')
      .upsert(
        {
          user_id: userId,
          cloud_name: cloudName,
          api_key: apiKey,
          api_secret: apiSecret,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'user_id' }
      );

    if (error) throw error;

    res.json({
      status: 'success',
      message: 'Cloudinary account connected successfully!',
      cloud_name: cloudName
    });

  } catch (error) {
    console.error('Configure error:', error);
    res.status(500).json({ status: 'error', message: 'Configuration failed' });
  }
});

// ✅ File Upload Endpoint - Handles multipart form data
app.post('/api/upload-file', upload.single('file'), async (req, res) => {
  try {
    const userId = req.body.userId;
    const file = req.file;

    console.log('File upload request - User ID:', userId);
    console.log('File details:', file ? {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size
    } : 'No file');

    if (!userId) {
      return res.status(400).json({
        status: 'error',
        message: 'User ID is required'
      });
    }

    if (!file) {
      return res.status(400).json({
        status: 'error',
        message: 'File is required'
      });
    }

    // Get user's credentials from Supabase
    const { data: userData, error } = await supabase
      .from('cloudinary_users')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !userData) {
      return res.status(404).json({
        status: 'error',
        message: 'Cloudinary not configured. Please run /configure first.'
      });
    }

    // Configure Cloudinary
    cloudinary.config({
      cloud_name: userData.cloud_name,
      api_key: userData.api_key,
      api_secret: userData.api_secret
    });

    // Convert buffer to base64 and upload
    const dataUri = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
    
    const uploadResult = await cloudinary.uploader.upload(dataUri, {
      resource_type: 'auto',
      public_id: file.originalname.split('.')[0]
    });

    res.json({
      status: 'success',
      secure_url: uploadResult.secure_url,
      public_id: uploadResult.public_id,
      format: uploadResult.format,
      bytes: uploadResult.bytes,
      width: uploadResult.width,
      height: uploadResult.height
    });

  } catch (error) {
    console.error('File upload error:', error);
    res.status(500).json({
      status: 'error',
      message: 'File upload failed: ' + error.message
    });
  }
});

app.post('/api/upload', async (req, res) => {
  try {
    const { userId, imageUrl, fileData, fileName, fileType } = req.body;

    if (!userId) {
      return res.status(400).json({
        status: 'error',
        message: 'User ID is required'
      });
    }

    // Get user's credentials from Supabase
    const { data: userData, error } = await supabase
      .from('cloudinary_users')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !userData) {
      return res.status(404).json({
        status: 'error',
        message: 'Cloudinary not configured. Please run /configure first.'
      });
    }

    // Configure Cloudinary
    cloudinary.config({
      cloud_name: userData.cloud_name,
      api_key: userData.api_key,
      api_secret: userData.api_secret
    });

    let uploadResult;

    // Handle URL upload
    if (imageUrl) {
      uploadResult = await cloudinary.uploader.upload(imageUrl, {
        resource_type: 'auto'
      });
    }
    // Handle file upload (base64)
    else if (fileData) {
      // Create data URI from base64
      const dataUri = `data:${fileType || 'image/jpeg'};base64,${fileData}`;
      uploadResult = await cloudinary.uploader.upload(dataUri, {
        resource_type: 'auto',
        public_id: fileName ? fileName.split('.')[0] : undefined
      });
    }
    else {
      return res.status(400).json({
        status: 'error',
        message: 'Either imageUrl or fileData is required'
      });
    }

    res.json({
      status: 'success',
      secure_url: uploadResult.secure_url,
      public_id: uploadResult.public_id,
      format: uploadResult.format,
      bytes: uploadResult.bytes,
      width: uploadResult.width,
      height: uploadResult.height
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Upload failed: ' + error.message
    });
  }
});
// ✅ 5. List Assets Endpoint - Get all images from user's Cloudinary
app.get('/api/assets/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Get user's credentials from Supabase
    const { data: userData, error } = await supabase
      .from('cloudinary_users')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !userData) {
      return res.status(404).json({
        status: 'error',
        message: 'Cloudinary not configured. Please run /configure first.'
      });
    }

    // Configure Cloudinary with user's credentials
    cloudinary.config({
      cloud_name: userData.cloud_name,
      api_key: userData.api_key,
      api_secret: userData.api_secret
    });

    // Get all images from Cloudinary
    const assetsResult = await cloudinary.api.resources({
      type: 'upload',
      resource_type: 'image',
      max_results: 50, // Limit to 50 images
      context: true // Include metadata
    });

    // Format the response
    const formattedAssets = assetsResult.resources.map(asset => ({
      public_id: asset.public_id,
      secure_url: asset.secure_url,
      format: asset.format,
      bytes: asset.bytes,
      width: asset.width,
      height: asset.height,
      created_at: asset.created_at,
      context: asset.context || {}
    }));

    res.json({
      status: 'success',
      total_count: assetsResult.resources.length,
      assets: formattedAssets
    });

  } catch (error) {
    console.error('List assets error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch assets: ' + error.message
    });
  }
});

// Transform endpoint
app.post('/api/transform', async (req, res) => {
  try {
    const { userId, imageUrl, transformation } = req.body;

    if (!userId || !imageUrl) {
      return res.status(400).json({
        status: 'error',
        message: 'User ID and image URL are required'
      });
    }

    const { data: userData, error } = await supabase
      .from('cloudinary_users')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !userData) {
      return res.status(404).json({
        status: 'error',
        message: 'Cloudinary not configured'
      });
    }

    cloudinary.config({
      cloud_name: userData.cloud_name,
      api_key: userData.api_key,
      api_secret: userData.api_secret
    });

    const transformOptions = {};

    if (transformation === 'grayscale') {
      transformOptions.effect = 'grayscale';
    } else if (transformation === 'sepia') {
      transformOptions.effect = 'sepia';
    } else if (transformation === 'blur') {
      transformOptions.effect = 'blur:500';
    } else if (transformation && transformation.includes('x')) {
      const [width, height] = transformation.split('x');
      transformOptions.width = parseInt(width, 10);
      transformOptions.height = parseInt(height, 10);
      transformOptions.crop = 'fill';
    }

    const uploadResult = await cloudinary.uploader.upload(imageUrl, transformOptions);

    res.json({
      status: 'success',
      secure_url: uploadResult.secure_url,
      public_id: uploadResult.public_id,
      transformation
    });
  } catch (error) {
    console.error('Transform error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Transformation failed: ' + error.message
    });
  }
});

// Fetch user info
app.get('/api/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const { data, error } = await supabase
      .from('cloudinary_users')
      .select('cloud_name, created_at, updated_at')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      return res.status(404).json({
        status: 'error',
        message: 'User not configured'
      });
    }

    res.json({
      status: 'success',
      data
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get user info'
    });
  }
});

// Helper to validate Cloudinary credentials
async function testCloudinaryCredentials(cloudName, apiKey, apiSecret) {
  return new Promise((resolve) => {
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret
    });

    cloudinary.api.ping((error) => {
      if (error) {
        console.log('Credential test failed:', error.message);
        resolve(false);
      } else {
        console.log('Credential test passed');
        resolve(true);
      }
    });
  });
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 Cloudinary Bot Backend running on port ${PORT}`);
  console.log(`📊 Supabase URL: ${process.env.SUPABASE_URL}`);
});

